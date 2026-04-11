import axios from 'axios';

const raw = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const API_BASE_URL = raw.replace(/\/$/, '');

export const uploadStatement = async (file, signal) => {
    const formData = new FormData();
    if (Array.isArray(file)) {
        file.forEach((f) => formData.append('files', f));
    } else {
        formData.append('files', file); // Backend expects 'files' list
    }

    const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        signal,
    });

    return response.data;
};

export const getSlipProgress = async (taskId) => {
    const response = await axios.get(
        `${API_BASE_URL}/upload-slip-progress?task_id=${taskId}`,
    );
    return response.data;
};

export const uploadSlip = async (file, taskId, signal) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post(
        `${API_BASE_URL}/upload-slip?task_id=${taskId}`,
        formData,
        {
            headers: { 'Content-Type': 'multipart/form-data' },
            signal,
        },
    );

    return response.data;
};

export const fetchRecords = async () => {
    const response = await axios.get(`${API_BASE_URL}/api/records`);
    return response.data;
};

export const fetchRecordDetail = async (id) => {
    const response = await axios.get(`${API_BASE_URL}/api/records/${id}`);
    return response.data;
};

export const saveRecordToDB = async (record) => {
    const response = await axios.post(`${API_BASE_URL}/api/records`, record);
    return response.data;
};

export const deleteRecordFromDB = async (id) => {
    const response = await axios.delete(`${API_BASE_URL}/api/records/${id}`);
    return response.data;
};
