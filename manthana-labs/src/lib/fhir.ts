import type { Study, DoctorProfile } from "./types";

/**
 * buildFhirDiagnosticReport
 * ─────────────────────────────────────────────────────────────────────
 * Generates a FHIR R4 DiagnosticReport bundle (JSON) from a confirmed
 * Manthana study. Designed for downstream EHR / HIE handoff.
 *
 * NOTE: Intentionally lightweight (no `@types/fhir` dep). We follow the
 * minimum viable shape that hospital EHR adapters expect:
 *   Bundle → DiagnosticReport → Observation[] (one per finding)
 */

type Json = Record<string, unknown>;

const MANTHANA_SYSTEM = "https://manthana.health/fhir/CodeSystem/finding-id";

export function buildFhirDiagnosticReport(study: Study, doctor: DoctorProfile | null): Json {
  const now = new Date().toISOString();
  const reportId = `manthana-${study.id}`;
  const findings = study.report?.findings ?? [];

  const observations: Json[] = findings.map((f, i) => {
    const codings: Json[] = [];
    if (f.icd10Code) {
      codings.push({
        system: "http://hl7.org/fhir/sid/icd-10",
        code: f.icd10Code,
        display: f.icd10Label ?? f.title,
      });
    }
    if (f.snomedCode) {
      codings.push({
        system: "http://snomed.info/sct",
        code: f.snomedCode,
        display: f.snomedLabel ?? f.title,
      });
    }
    codings.push({
      system: MANTHANA_SYSTEM,
      code: f.id,
      display: f.title,
    });

    const interpretationCode =
      f.severity === "critical"
        ? { code: "HH", display: "Critical high" }
        : f.severity === "high"
        ? { code: "H", display: "High" }
        : f.severity === "medium"
        ? { code: "A", display: "Abnormal" }
        : { code: "N", display: "Normal" };

    return {
      resourceType: "Observation",
      id: `obs-${study.id}-${i}`,
      status: "preliminary",
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "imaging",
              display: "Imaging",
            },
          ],
        },
      ],
      code: { coding: codings, text: f.title },
      effectiveDateTime: study.createdAt,
      issued: now,
      bodySite: f.anatomicalRegion ? { text: f.anatomicalRegion } : undefined,
      interpretation: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
              ...interpretationCode,
            },
          ],
        },
      ],
      valueString: f.observation ?? f.description,
      note: [
        f.impression ? { text: `Impression: ${f.impression}` } : null,
        f.recommendation ? { text: `Recommendation: ${f.recommendation}` } : null,
        { text: `Model confidence: ${(f.confidence * 100).toFixed(0)}%` },
        f.urgency ? { text: `Urgency: ${f.urgency.toUpperCase()}` } : null,
      ].filter(Boolean),
      // Differentials → component[]
      component: (f.differentials ?? []).map((d, di) => ({
        code: {
          coding: [
            d.icd10Code
              ? {
                  system: "http://hl7.org/fhir/sid/icd-10",
                  code: d.icd10Code,
                  display: d.dx,
                }
              : { system: MANTHANA_SYSTEM, code: `${f.id}-dx-${di}`, display: d.dx },
          ],
          text: `Differential: ${d.dx}`,
        },
        valueQuantity: {
          value: Math.round(d.likelihood * 100),
          unit: "%",
          system: "http://unitsofmeasure.org",
          code: "%",
        },
      })),
    } satisfies Json;
  });

  const diagnosticReport: Json = {
    resourceType: "DiagnosticReport",
    id: reportId,
    status: study.reviewConfirmedAt ? "final" : "preliminary",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0074",
            code: "RAD",
            display: "Radiology",
          },
        ],
      },
    ],
    code: { text: study.modality.label },
    effectiveDateTime: study.createdAt,
    issued: study.reviewConfirmedAt ?? now,
    performer: doctor
      ? [
          {
            display: doctor.fullName,
            identifier: { system: "https://nmc.org.in/council", value: doctor.councilNumber },
          },
        ]
      : [],
    conclusion: study.report?.narrative,
    conclusionCode: findings
      .filter((f) => f.icd10Code)
      .map((f) => ({
        coding: [
          {
            system: "http://hl7.org/fhir/sid/icd-10",
            code: f.icd10Code,
            display: f.icd10Label ?? f.title,
          },
        ],
      })),
    result: observations.map((o) => ({ reference: `Observation/${(o as Json).id}` })),
    extension: [
      {
        url: "https://manthana.health/fhir/StructureDefinition/tier",
        valueString: study.modality.tier,
      },
      {
        url: "https://manthana.health/fhir/StructureDefinition/overall-confidence",
        valueDecimal: study.report?.overallConfidence,
      },
      study.report?.criticalAcknowledgedAt
        ? {
            url: "https://manthana.health/fhir/StructureDefinition/critical-acknowledged",
            valueDateTime: study.report.criticalAcknowledgedAt,
          }
        : null,
    ].filter(Boolean),
  };

  return {
    resourceType: "Bundle",
    id: `bundle-${study.id}`,
    type: "collection",
    timestamp: now,
    entry: [
      { resource: diagnosticReport, fullUrl: `urn:uuid:${reportId}` },
      ...observations.map((o) => ({
        resource: o,
        fullUrl: `urn:uuid:${(o as Json).id as string}`,
      })),
    ],
  };
}

/** Trigger a download of a FHIR JSON file in the browser. */
export function downloadFhirReport(study: Study, doctor: DoctorProfile | null) {
  const bundle = buildFhirDiagnosticReport(study, doctor);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `manthana-fhir-${study.id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
