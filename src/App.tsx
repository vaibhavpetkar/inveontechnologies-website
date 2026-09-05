import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/Home';
import Services from '@/pages/Services';
import ServiceDetail from '@/pages/ServiceDetail';
import Products from '@/pages/Products';
import ProductDetail from '@/pages/ProductDetail';
import Clients from '@/pages/Clients';
import About from '@/pages/About';
import Contact from '@/pages/Contact';
import Careers from '@/pages/Careers';
import Insights from '@/pages/Insights';
import CandidateAuth from '@/pages/careers/CandidateAuth';
import CandidateProfile from '@/pages/careers/CandidateProfile';
import ApplyRole from '@/pages/careers/ApplyRole';
import AptitudeTest from '@/pages/careers/AptitudeTest';
import InternshipPayment from '@/pages/careers/InternshipPayment';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import ScrollToTop from '@/components/layout/ScrollToTop';

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <ScrollToTop />
      <Navbar />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/services" component={Services} />
          <Route path="/services/:slug" component={ServiceDetail} />
          <Route path="/products" component={Products} />
          <Route path="/products/:id" component={ProductDetail} />
          <Route path="/insights" component={Insights} />
          <Route path="/clients" component={Clients} />
          <Route path="/about" component={About} />
          <Route path="/contact" component={Contact} />
          <Route path="/careers" component={Careers} />
          <Route path="/careers/login" component={CandidateAuth} />
          <Route path="/careers/profile" component={CandidateProfile} />
          <Route path="/careers/apply/:roleId" component={ApplyRole} />
          <Route path="/careers/test/:roleId" component={AptitudeTest} />
          <Route path="/careers/payment/:roleId" component={InternshipPayment} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
