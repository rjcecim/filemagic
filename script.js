import { fileTypeFromBuffer } from 'https://cdn.skypack.dev/file-type';
import mime from 'https://cdn.skypack.dev/mime-types';

// Seletores de elementos
const fileInput = document.getElementById('fileInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const loading = document.getElementById('loading');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const resultsTable = document.getElementById('resultsTable');
const exportBtn = document.getElementById('exportBtn');
const searchInput = document.getElementById('searchInput');
const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
const errorModalBody = document.getElementById('errorModalBody');

// Array para armazenar os resultados
let analysisResults = [];

// Função para escapar caracteres HTML e prevenir injeção
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Função para verificar se o buffer contém apenas caracteres de texto legíveis
function isText(buffer) {
  for (let i = 0; i < Math.min(buffer.length, 1000); i++) { // Verifica até os primeiros 1000 bytes
    const byte = buffer[i];
    // Considera caracteres legíveis (32 a 126 são caracteres imprimíveis, 9, 10, 13 são tab, newline, carriage return)
    if (
      (byte < 32 || byte > 126) &&
      byte !== 9 && byte !== 10 && byte !== 13
    ) {
      return false;
    }
  }
  return true;
}

// Função para extrair a extensão do arquivo original
function getFileExtension(filename) {
  const parts = filename.split('.');
  if (parts.length > 1) {
    return '.' + parts.pop().toLowerCase();
  }
  return '';
}

// Função para adicionar uma linha na tabela
function addRow(result) {
  const row = document.createElement('tr');
  
  // Ícone Representativo
  let iconClass = 'bi-file-earmark';
  switch(result.mimeType) {
    case 'application/x-msdownload':
      iconClass = 'bi-file-earmark-exe';
      break;
    case 'text/plain':
      iconClass = 'bi-file-earmark-text';
      break;
    case 'image/jpeg':
    case 'image/png':
    case 'image/gif':
    case 'image/bmp':
    case 'image/tiff':
      iconClass = 'bi-file-earmark-image';
      break;
    case 'application/pdf':
      iconClass = 'bi-file-earmark-pdf';
      break;
    case 'application/zip':
    case 'application/x-rar-compressed':
    case 'application/x-7z-compressed':
      iconClass = 'bi-file-earmark-zip';
      break;
    case 'application/javascript':
      iconClass = 'bi-file-earmark-code';
      break;
    case 'application/json':
      iconClass = 'bi-file-earmark-code';
      break;
    case 'text/html':
      iconClass = 'bi-file-earmark-code';
      break;
    // Adicione mais casos conforme necessário
    default:
      iconClass = 'bi-file-earmark';
  }
  
  row.innerHTML = `
    <td>
      <i class="bi ${iconClass} me-2"></i>
      ${escapeHtml(result.fileName)}
    </td>
    <td>${result.mimeType}</td>
    <td>${result.realExtension}</td>
    <td>${result.sizeKB}</td>
    <td>
      ${result.extensionMatch ? '<i class="bi bi-check-circle-fill text-success" title="Extensão correta"></i>' : '<i class="bi bi-x-circle-fill text-danger" title="Extensão incorreta"></i>'}
    </td>
  `;
  resultsTable.appendChild(row);
}

// Função para exportar resultados para CSV
function exportToCSV() {
  const headers = ['Nome do Arquivo', 'Tipo (MIME)', 'Extensão Real', 'Tamanho (KB)', 'Extensão Original', 'Correspondência'];
  const rows = analysisResults.map(result => [
    `"${result.fileName.replace(/"/g, '""')}"`, // Escapa aspas duplas
    `"${result.mimeType}"`,
    `"${result.realExtension}"`,
    `"${result.sizeKB}"`,
    `"${result.originalExtension}"`,
    `"${result.extensionMatch ? 'Sim' : 'Não'}"`
  ]);
  
  let csvContent = 'data:text/csv;charset=utf-8,' 
    + headers.join(',') + '\n' 
    + rows.map(e => e.join(',')).join('\n');
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  const timestamp = new Date().toISOString().replace(/[:.-]/g, '');
  link.setAttribute('download', `analisador_tipo_arquivo_${timestamp}.csv`);
  document.body.appendChild(link); // Necessário para Firefox
  link.click();
  document.body.removeChild(link);
}

// Função para ordenar os resultados
function sortResults(key) {
  analysisResults.sort((a, b) => {
    if (key === 'sizeKB') {
      return parseFloat(a.sizeKB) - parseFloat(b.sizeKB);
    } else {
      return a[key].localeCompare(b[key]);
    }
  });
  renderTable();
}

// Função para renderizar a tabela completa
function renderTable() {
  resultsTable.innerHTML = '';
  analysisResults.forEach(result => addRow(result));
}

// Função para filtrar resultados
function filterResults(query) {
  const filtered = analysisResults.filter(result => result.fileName.toLowerCase().includes(query.toLowerCase()));
  resultsTable.innerHTML = '';
  filtered.forEach(result => addRow(result));
}

// Evento de click no botão de análise
analyzeBtn.addEventListener('click', analyzeFiles);

// Evento de busca
searchInput.addEventListener('input', (e) => {
  const query = e.target.value;
  filterResults(query);
});

// Evento de exportação
exportBtn.addEventListener('click', exportToCSV);

// Função principal para analisar os arquivos
async function analyzeFiles() {
  const files = fileInput.files;
  const resultsTable = document.getElementById('resultsTable');
  const loading = document.getElementById('loading');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  
  // Limpa resultados anteriores
  resultsTable.innerHTML = '';
  analysisResults = [];
  exportBtn.disabled = true;
  
  if (files.length === 0) {
    alert('Por favor, selecione pelo menos um arquivo.');
    return;
  }
  
  // Mostra o indicador de carregamento e a barra de progresso
  loading.style.display = 'block';
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  progressBar.textContent = '0%';
  
  const totalFiles = files.length;
  let processedFiles = 0;
  
  for (const file of files) {
    try {
      // Validação de tamanho de arquivo (limite de 100MB)
      const maxSizeMB = 100;
      if (file.size > maxSizeMB * 1024 * 1024) {
        throw new Error(`O arquivo "${file.name}" excede o tamanho máximo permitido de ${maxSizeMB}MB.`);
      }
      
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      const type = await fileTypeFromBuffer(buffer);

      let mimeType = 'Desconhecido';
      let realExtension = 'Desconhecida';
      let extensionMatch = false;
      const originalExtension = getFileExtension(file.name) || '';

      if (type && type.mime) {
        mimeType = type.mime;
        realExtension = mime.extension(type.mime) || 'Desconhecida';
      } else {
        // Verificação adicional para arquivos de texto
        if (isText(buffer)) {
          mimeType = 'text/plain';
          realExtension = mime.extension('text/plain') || '.txt';
        }
      }

      // Se realExtension ainda é desconhecida, tentar extrair a extensão original
      if (realExtension === 'Desconhecida') {
        realExtension = getFileExtension(file.name) || 'Desconhecida';
      }

      // Verificação de correspondência entre a extensão original e a extensão real
      if (realExtension !== 'Desconhecida' && originalExtension !== '') {
        extensionMatch = realExtension === originalExtension;
      }

      const fileSizeKB = (file.size / 1024).toFixed(2);

      // Adiciona o resultado ao array
      analysisResults.push({
        fileName: file.name,
        mimeType: mimeType,
        realExtension: realExtension,
        sizeKB: fileSizeKB,
        originalExtension: originalExtension,
        extensionMatch: extensionMatch
      });
    } catch (error) {
      console.error(`Erro ao analisar o arquivo ${file.name}:`, error);
      analysisResults.push({
        fileName: file.name,
        mimeType: 'Erro na Análise',
        realExtension: 'Erro',
        sizeKB: (file.size / 1024).toFixed(2),
        originalExtension: getFileExtension(file.name) || '',
        extensionMatch: false
      });
      
      // Mostra o modal de erro
      errorModalBody.textContent = error.message;
      errorModal.show();
    } finally {
      // Atualiza a barra de progresso
      processedFiles++;
      const progressPercent = Math.round((processedFiles / totalFiles) * 100);
      progressBar.style.width = `${progressPercent}%`;
      progressBar.textContent = `${progressPercent}%`;
    }
  }
  
  // Renderiza a tabela com os resultados
  renderTable();
  
  // Esconde o indicador de carregamento e a barra de progresso
  loading.style.display = 'none';
  progressContainer.style.display = 'none';
  
  // Habilita o botão de exportação se houver resultados
  if (analysisResults.length > 0) {
    exportBtn.disabled = false;
  }
}