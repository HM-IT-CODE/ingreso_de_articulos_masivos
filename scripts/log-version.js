const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '../package.json');
const historyPath = path.join(__dirname, '../version-history.json');

try {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  let history = [];
  
  if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  }

  // Verificar si la versión actual ya está en el historial para evitar duplicados en el mismo build
  if (history.length > 0 && history[history.length - 1].version === pkg.version) {
    console.log(`La versión ${pkg.version} ya está registrada.`);
  } else {
    const newEntry = {
      version: pkg.version,
      date: new Date().toISOString(),
      action: "Compilación de Producción",
      notes: "Auto-incremento de versión mediante electron:build"
    };
    
    history.push(newEntry);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    console.log(`Historial actualizado: v${pkg.version} registrado.`);
  }
} catch (error) {
  console.error("Error actualizando el historial de versiones:", error.message);
}
