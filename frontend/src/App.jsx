import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import UploadStatementPage from './pages/UploadStatementPage.jsx';
import Dashboard from './pages/Dashboard.jsx';

const App = () => (
    <BrowserRouter>
        <Routes>
            <Route path="/" element={<UploadStatementPage />} />
            <Route path="/dashboard/:id" element={<Dashboard />} />
        </Routes>
    </BrowserRouter>
);

export default App;
