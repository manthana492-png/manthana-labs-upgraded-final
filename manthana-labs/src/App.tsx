import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DICOM_FEATURES_ENABLED } from "@/lib/featureFlags";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ThemeProvider } from "@/lib/theme";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Attestation from "./pages/Attestation";
import Studio from "./pages/Studio";
import NewStudy from "./pages/NewStudy";
import StudyView from "./pages/StudyView";
import ReportViewer from "./pages/ReportViewer";
import Worklist from "./pages/Worklist";
import Settings from "./pages/Settings";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import LiveCapture from "./pages/LiveCapture";
import MultiModalityStudy from "./pages/MultiModalityStudy";
import CompareStudy from "./pages/CompareStudy";
import DicomStudy from "./pages/DicomStudy";
import NotFound from "./pages/NotFound.tsx";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import About from "./pages/About";
import Contact from "./pages/Contact";
import { CookieConsent } from "./components/consent/CookieConsent";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <CookieConsent />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/attestation" element={<Attestation />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/app" element={<ProtectedRoute><Studio /></ProtectedRoute>} />
            <Route path="/app/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
            <Route path="/app/live" element={<ProtectedRoute><LiveCapture /></ProtectedRoute>} />
            <Route path="/app/new" element={<ProtectedRoute><NewStudy /></ProtectedRoute>} />
            <Route path="/app/multi" element={<ProtectedRoute><MultiModalityStudy /></ProtectedRoute>} />
            <Route path="/app/compare" element={<ProtectedRoute><CompareStudy /></ProtectedRoute>} />
            <Route
              path="/app/dicom"
              element={
                DICOM_FEATURES_ENABLED ? (
                  <ProtectedRoute><DicomStudy /></ProtectedRoute>
                ) : (
                  <Navigate to="/app" replace />
                )
              }
            />
            <Route path="/app/study/:id" element={<ProtectedRoute><StudyView /></ProtectedRoute>} />
            <Route path="/app/study/:id/report" element={<ProtectedRoute><ReportViewer /></ProtectedRoute>} />
            <Route path="/app/study/:id/report/:findingId" element={<ProtectedRoute><ReportViewer /></ProtectedRoute>} />
            <Route path="/app/history" element={<ProtectedRoute><Worklist /></ProtectedRoute>} />
            <Route path="/app/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
