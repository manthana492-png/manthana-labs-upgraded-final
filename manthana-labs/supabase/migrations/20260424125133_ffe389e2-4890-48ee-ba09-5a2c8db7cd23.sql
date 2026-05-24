
-- Fix mutable search_path warnings
CREATE OR REPLACE FUNCTION public.medical_codes_tsv_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english', coalesce(NEW.code,'') || ' ' || coalesce(NEW.label,'') || ' ' || coalesce(NEW.category,''));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Seed common medical codes
INSERT INTO public.medical_codes (system, code, label, category) VALUES
  ('icd10','J18.1','Lobar pneumonia, unspecified organism','Respiratory'),
  ('icd10','J18.9','Pneumonia, unspecified organism','Respiratory'),
  ('icd10','J44.9','Chronic obstructive pulmonary disease, unspecified','Respiratory'),
  ('icd10','J45.909','Unspecified asthma, uncomplicated','Respiratory'),
  ('icd10','J81.0','Acute pulmonary edema','Respiratory'),
  ('icd10','J84.10','Pulmonary fibrosis, unspecified','Respiratory'),
  ('icd10','J98.11','Atelectasis','Respiratory'),
  ('icd10','R91.1','Solitary pulmonary nodule','Respiratory'),
  ('icd10','C34.10','Malignant neoplasm of upper lobe, unspecified bronchus or lung','Oncology'),
  ('icd10','C43.9','Malignant melanoma of skin, unspecified','Oncology'),
  ('icd10','C44.91','Basal cell carcinoma of skin, unspecified','Oncology'),
  ('icd10','D03.9','Melanoma in situ, unspecified','Oncology'),
  ('icd10','D22.9','Melanocytic nevi, unspecified','Dermatology'),
  ('icd10','D48.5','Neoplasm of uncertain behavior of skin','Dermatology'),
  ('icd10','L82.1','Other seborrheic keratosis','Dermatology'),
  ('icd10','I20.9','Angina pectoris, unspecified','Cardiology'),
  ('icd10','I21.4','Non-ST elevation (NSTEMI) myocardial infarction','Cardiology'),
  ('icd10','I25.10','Atherosclerotic heart disease without angina pectoris','Cardiology'),
  ('icd10','I26.99','Other pulmonary embolism without acute cor pulmonale','Cardiology'),
  ('icd10','I48.91','Unspecified atrial fibrillation','Cardiology'),
  ('icd10','I63.9','Cerebral infarction, unspecified','Neurology'),
  ('icd10','I61.9','Nontraumatic intracerebral hemorrhage, unspecified','Neurology'),
  ('icd10','I60.9','Nontraumatic subarachnoid hemorrhage, unspecified','Neurology'),
  ('icd10','G93.6','Cerebral edema','Neurology'),
  ('icd10','M17.11','Unilateral primary osteoarthritis, right knee','Musculoskeletal'),
  ('icd10','M51.36','Other intervertebral disc degeneration, lumbar region','Musculoskeletal'),
  ('icd10','M46.46','Discitis, unspecified, lumbar region','Musculoskeletal'),
  ('icd10','M84.359A','Stress fracture, lower leg, initial encounter','Musculoskeletal'),
  ('icd10','K76.0','Fatty (change of) liver, not elsewhere classified','GI / Hepatobiliary'),
  ('icd10','K80.20','Calculus of gallbladder without cholecystitis','GI / Hepatobiliary'),
  ('icd10','K35.80','Unspecified acute appendicitis','GI / Hepatobiliary'),
  ('icd10','N20.0','Calculus of kidney','Genitourinary'),
  ('icd10','N39.0','Urinary tract infection, site not specified','Genitourinary'),
  ('icd10','R94.31','Abnormal electrocardiogram','Diagnostics'),
  ('icd10','R10.9','Unspecified abdominal pain','Symptoms'),
  ('icd10','R06.02','Shortness of breath','Symptoms'),
  ('icd10','R07.9','Chest pain, unspecified','Symptoms'),
  ('icd10','Z01.6','Encounter for radiological examination, NEC','Encounter'),
  ('icd10','Z01.89','Encounter for other specified special examinations','Encounter'),
  -- SNOMED CT
  ('snomed','385093006','Community acquired pneumonia','Respiratory'),
  ('snomed','233604007','Pneumonia','Respiratory'),
  ('snomed','13645005','Chronic obstructive lung disease','Respiratory'),
  ('snomed','195967001','Asthma','Respiratory'),
  ('snomed','19829001','Disorder of lung','Respiratory'),
  ('snomed','51615001','Interstitial lung disease','Respiratory'),
  ('snomed','427359005','Solitary pulmonary nodule','Respiratory'),
  ('snomed','168731009','Normal chest X-ray','Diagnostics'),
  ('snomed','168732002','Normal liver ultrasound','Diagnostics'),
  ('snomed','428461000124100','Normal CT of head','Diagnostics'),
  ('snomed','164873001','ST segment changes','Cardiology'),
  ('snomed','22298006','Myocardial infarction','Cardiology'),
  ('snomed','49436004','Atrial fibrillation','Cardiology'),
  ('snomed','230690007','Cerebrovascular accident','Neurology'),
  ('snomed','274100004','Cerebral hemorrhage','Neurology'),
  ('snomed','21454007','Subarachnoid hemorrhage','Neurology'),
  ('snomed','2092003','Cerebral edema','Neurology'),
  ('snomed','239873007','Osteoarthritis of knee','Musculoskeletal'),
  ('snomed','445540008','Lumbar intervertebral disc degeneration','Musculoskeletal'),
  ('snomed','197321007','Steatosis of liver','GI / Hepatobiliary'),
  ('snomed','266474003','Calculus of gallbladder','GI / Hepatobiliary'),
  ('snomed','85189001','Acute appendicitis','GI / Hepatobiliary'),
  ('snomed','95570007','Renal calculus','Genitourinary'),
  ('snomed','68566005','Urinary tract infection','Genitourinary'),
  ('snomed','400122007','Compound melanocytic nevus','Dermatology'),
  ('snomed','16403006','Pigmented skin lesion','Dermatology'),
  ('snomed','372244006','Malignant melanoma','Oncology'),
  ('snomed','254837009','Malignant tumor of breast','Oncology'),
  ('snomed','363358000','Malignant tumor of lung','Oncology')
ON CONFLICT (system, code) DO NOTHING;
