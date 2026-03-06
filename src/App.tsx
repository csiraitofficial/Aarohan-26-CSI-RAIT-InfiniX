import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { ThemeProvider } from "@/components/theme-provider";
import { AccessibilityProvider, AccessibilityPanel } from "@/components/AccessibilityPanel";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Monitoring from "./pages/Monitoring";
import Analytics from "./pages/Analytics";
import SimulationNew from "./pages/SimulationNew";
import SimulationTier1 from "./pages/SimulationTier1";
import SimulationTier2 from "./pages/SimulationTier2";
import SimulationComparison from "./pages/SimulationComparison";
import Emergency from "./pages/Emergency";
import IncidentManagement from "./pages/IncidentManagement";
import PersonnelManagement from "./pages/PersonnelManagement";
import UserDashboard from "./pages/UserDashboard";
import SystemGuide from "./pages/SystemGuide";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="yatayat-theme">
      <AccessibilityProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            {/* Skip to main content link for keyboard navigation */}
            <a href="#main-content" className="skip-link">
              Skip to main content
            </a>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
              <Route path="/monitoring" element={<ProtectedRoute><Layout><Monitoring /></Layout></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} />
              <Route path="/simulation-new" element={<ProtectedRoute><Layout><SimulationNew /></Layout></ProtectedRoute>} />
              <Route path="/simulation-tier1" element={<ProtectedRoute><Layout><SimulationTier1 /></Layout></ProtectedRoute>} />
              <Route path="/simulation-tier2" element={<ProtectedRoute><Layout><SimulationTier2 /></Layout></ProtectedRoute>} />
              <Route path="/simulation-comparison" element={<ProtectedRoute><Layout><SimulationComparison /></Layout></ProtectedRoute>} />
              <Route path="/emergency" element={<ProtectedRoute><Layout><Emergency /></Layout></ProtectedRoute>} />
              <Route path="/incidents" element={<ProtectedRoute><Layout><IncidentManagement /></Layout></ProtectedRoute>} />
              <Route path="/personnel" element={<ProtectedRoute><Layout><PersonnelManagement /></Layout></ProtectedRoute>} />
              <Route path="/user-dashboard" element={<ProtectedRoute><Layout><UserDashboard /></Layout></ProtectedRoute>} />
              <Route path="/system-guide" element={<ProtectedRoute><Layout><SystemGuide /></Layout></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          {/* Floating Accessibility Panel - available on all pages */}
          <AccessibilityPanel />
        </TooltipProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;