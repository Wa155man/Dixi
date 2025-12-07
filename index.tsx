import React from 'react';
import ReactDOM from 'react-dom/client';

// Get App from global
const { App } = (window as any).Dixi.components;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);