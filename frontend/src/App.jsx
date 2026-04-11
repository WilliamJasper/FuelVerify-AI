import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import RecordsListPage from './pages/RecordsListPage.jsx';
import UploadStatementPageKBANK from './pages/UploadStatementPageKBANK.jsx';
import UploadStatementPageBBL from './pages/UploadStatementPageBBL.jsx';
import DashboardKBANK from './pages/DashboardKBANK.jsx';
import DashboardBBL from './pages/DashboardBBL.jsx';

const basename =
    (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || undefined;

const App = () => (
    <BrowserRouter basename={basename}>
        <Routes>
            <Route path="/" element={<RecordsListPage />} />
            <Route path="/setup-statement/kbank/:id" element={<UploadStatementPageKBANK />} />
            <Route path="/setup-statement/bbl/:id" element={<UploadStatementPageBBL />} />
            <Route path="/dashboard/kbank/:id" element={<DashboardKBANK />} />
            <Route path="/dashboard/bbl/:id" element={<DashboardBBL />} />
        </Routes>
    </BrowserRouter>
);

export default App;
