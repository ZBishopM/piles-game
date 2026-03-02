// Configuración del servidor
const SERVER_URL = 'http://localhost:3000';

// Elementos del DOM
const testConnectionBtn = document.getElementById('testConnection');
const testHealthBtn = document.getElementById('testHealth');
const serverStatus = document.getElementById('serverStatus');
const healthStatus = document.getElementById('healthStatus');

// Función para probar la conexión con el servidor
async function testServerConnection() {
    serverStatus.className = 'status-message loading';
    serverStatus.textContent = '⏳ Conectando al servidor...';

    try {
        const response = await fetch(`${SERVER_URL}/`);
        const text = await response.text();

        if (response.ok) {
            serverStatus.className = 'status-message success';
            serverStatus.textContent = `✅ Conexión exitosa!\n\n${text}`;
        } else {
            serverStatus.className = 'status-message error';
            serverStatus.textContent = `❌ Error: ${response.status} - ${response.statusText}`;
        }
    } catch (error) {
        serverStatus.className = 'status-message error';
        serverStatus.textContent = `❌ Error de conexión: ${error.message}\n\nAsegúrate de que el servidor esté corriendo en el puerto 3000.`;
    }
}

// Función para verificar el health check
async function testHealthCheck() {
    healthStatus.className = 'status-message loading';
    healthStatus.textContent = '⏳ Verificando health...';

    try {
        const response = await fetch(`${SERVER_URL}/health`);
        const text = await response.text();

        if (response.ok) {
            healthStatus.className = 'status-message success';
            healthStatus.textContent = `✅ Health check exitoso!\n\nRespuesta: ${text}`;
        } else {
            healthStatus.className = 'status-message error';
            healthStatus.textContent = `❌ Error: ${response.status} - ${response.statusText}`;
        }
    } catch (error) {
        healthStatus.className = 'status-message error';
        healthStatus.textContent = `❌ Error de conexión: ${error.message}`;
    }
}

// Event listeners
testConnectionBtn.addEventListener('click', testServerConnection);
testHealthBtn.addEventListener('click', testHealthCheck);

// Probar conexión automáticamente al cargar la página
window.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 Piles! Cliente cargado');
    console.log(`📡 Servidor configurado en: ${SERVER_URL}`);

    // Probar conexión automáticamente después de 1 segundo
    setTimeout(testServerConnection, 1000);
});
