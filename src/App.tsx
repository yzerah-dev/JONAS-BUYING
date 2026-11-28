import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './data/StoreProvider';
import Layout from './components/Layout';
import Landing from './components/Landing';
import PortalLayout from './portal/PortalLayout';

// Dans un Artifact claude.ai, la navigation reste en mémoire (pas d'URL en #/chemin)
const Router = import.meta.env.VITE_ARTIFACT ? MemoryRouter : HashRouter;

// Chaque écran est chargé à la demande (bundle initial plus léger)
const Home = lazy(() => import('./pages/Home'));
const Proformas = lazy(() => import('./pages/Proformas'));
const ProformaDetail = lazy(() => import('./pages/ProformaDetail'));
const Products = lazy(() => import('./pages/Products'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const ProductListsPage = lazy(() => import('./pages/ProductListsPage'));
const Design = lazy(() => import('./pages/Design'));
const Containers = lazy(() => import('./pages/Containers'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const SupplierDetail = lazy(() => import('./pages/SupplierDetail'));
const Finance = lazy(() => import('./pages/Finance'));
const Settings = lazy(() => import('./pages/Settings'));
const Journal = lazy(() => import('./pages/Journal'));
const Booking = lazy(() => import('./pages/Booking'));
const Quotations = lazy(() => import('./pages/Quotations'));
const PortalOffers = lazy(() => import('./portal/PortalOffers'));
const portal = <K extends keyof typeof import('./portal/PortalPages')>(name: K) => lazy(() => import('./portal/PortalPages').then((m) => ({ default: m[name] as () => ReactNode })));
const PortalHome = portal('PortalHome');
const PortalProducts = portal('PortalProducts');
const PortalProductDetail = portal('PortalProductDetail');
const PortalProformas = portal('PortalProformas');
const PortalPacks = portal('PortalPacks');
const PortalLoading = portal('PortalLoading');
const PortalBooking = portal('PortalBooking');
const ForwarderLayout = lazy(() => import('./forwarder/ForwarderLayout'));
const ForwarderHome = lazy(() => import('./forwarder/ForwarderHome'));
const PortalContainers = portal('PortalContainers');
const PortalFinance = portal('PortalFinance');

const page = (el: ReactNode) => <Suspense fallback={<div className="page-loading">Chargement…</div>}>{el}</Suspense>;

export default function App() {
  return (
    <StoreProvider>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Landing />} />
            <Route path="performance" element={page(<Home />)} />
            <Route path="proformas" element={page(<Proformas />)} />
            <Route path="proformas/:id" element={page(<ProformaDetail />)} />
            <Route path="produits" element={page(<Products />)} />
            <Route path="listes" element={page(<ProductListsPage />)} />
            <Route path="produits/:id" element={page(<ProductDetail />)} />
            {/* Une seule page Développement (ex-Espace Designer) */}
            <Route path="developpement" element={<Navigate to="/design" replace />} />
            <Route path="design" element={page(<Design />)} />
            <Route path="conteneurs" element={page(<Containers />)} />
            <Route path="fournisseurs" element={page(<Suppliers />)} />
            <Route path="fournisseurs/:id" element={page(<SupplierDetail />)} />
            <Route path="finance" element={page(<Finance />)} />
            <Route path="parametres" element={page(<Settings />)} />
            <Route path="journal" element={page(<Journal />)} />
            <Route path="booking" element={page(<Booking />)} />
            <Route path="offres" element={page(<Quotations />)} />
          </Route>
          <Route path="portail" element={<PortalLayout />}>
            <Route index element={page(<PortalHome />)} />
            <Route path="produits" element={page(<PortalProducts />)} />
            <Route path="produits/:id" element={page(<PortalProductDetail />)} />
            <Route path="proformas" element={page(<PortalProformas />)} />
            <Route path="quotations" element={page(<PortalOffers mode="rfq" />)} />
            <Route path="offres" element={page(<PortalOffers mode="offres" />)} />
            <Route path="packs" element={page(<PortalPacks />)} />
            <Route path="booking" element={page(<PortalBooking />)} />
            <Route path="chargement" element={page(<PortalLoading />)} />
            <Route path="conteneurs" element={page(<PortalContainers />)} />
            <Route path="finance" element={page(<PortalFinance />)} />
          </Route>
          <Route path="transitaire" element={page(<ForwarderLayout />)}>
            <Route index element={<Navigate to="a-booker" replace />} />
            <Route path=":etape" element={page(<ForwarderHome />)} />
          </Route>
        </Routes>
      </Router>
    </StoreProvider>
  );
}
