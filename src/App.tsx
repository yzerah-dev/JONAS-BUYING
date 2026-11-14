import { HashRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './data/store';
import Layout from './components/Layout';
import Home from './pages/Home';
import Proformas from './pages/Proformas';
import ProformaDetail from './pages/ProformaDetail';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Development from './pages/Development';
import Design from './pages/Design';
import Containers from './pages/Containers';
import Suppliers from './pages/Suppliers';
import SupplierDetail from './pages/SupplierDetail';
import Finance from './pages/Finance';
import Settings from './pages/Settings';
import PortalLayout from './portal/PortalLayout';
import { PortalContainers, PortalFinance, PortalHome, PortalLoading, PortalPacks, PortalProducts, PortalProformas } from './portal/PortalPages';

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="proformas" element={<Proformas />} />
            <Route path="proformas/:id" element={<ProformaDetail />} />
            <Route path="produits" element={<Products />} />
            <Route path="produits/:id" element={<ProductDetail />} />
            <Route path="developpement" element={<Development />} />
            <Route path="design" element={<Design />} />
            <Route path="conteneurs" element={<Containers />} />
            <Route path="fournisseurs" element={<Suppliers />} />
            <Route path="fournisseurs/:id" element={<SupplierDetail />} />
            <Route path="finance" element={<Finance />} />
            <Route path="parametres" element={<Settings />} />
          </Route>
          <Route path="portail" element={<PortalLayout />}>
            <Route index element={<PortalHome />} />
            <Route path="produits" element={<PortalProducts />} />
            <Route path="proformas" element={<PortalProformas />} />
            <Route path="packs" element={<PortalPacks />} />
            <Route path="chargement" element={<PortalLoading />} />
            <Route path="conteneurs" element={<PortalContainers />} />
            <Route path="finance" element={<PortalFinance />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  );
}
