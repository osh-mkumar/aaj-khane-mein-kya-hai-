import fs from 'node:fs';

export function parseCSV(content, limit = Infinity) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.length > 1 || currentRow[0] !== '') {
        rows.push(currentRow);
        if (rows.length >= limit) break;
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

if (process.argv[1]?.includes('inspect-dataset')) {
  console.log('Reading data/IndianFoodDatasetCSV.csv...');
  const text = fs.readFileSync('data/IndianFoodDatasetCSV.csv', 'utf8');
  console.log('File size in MB:', (text.length / (1024 * 1024)).toFixed(2));
  const startTime = Date.now();
  const rows = parseCSV(text);
  console.log(`Parsed ${rows.length - 1} records in ${Date.now() - startTime}ms`);
  const header = rows[0];
  console.log('Header columns:', header);

  console.log('\n--- Sample Record 1 ---');
  header.forEach((col, idx) => {
    console.log(`  ${col}: ${(rows[1][idx] || '').slice(0, 70)}`);
  });

  console.log('\n--- Sample Record 2 ---');
  header.forEach((col, idx) => {
    console.log(`  ${col}: ${(rows[2][idx] || '').slice(0, 70)}`);
  });

  // Check statistics:
  let missingPrep = 0;
  let missingCook = 0;
  let missingServings = 0;
  let missingIngredients = 0;
  let missingInstructions = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[5] || r[5] === '0') missingPrep++;
    if (!r[6] || r[6] === '0') missingCook++;
    if (!r[8] || r[8] === '0') missingServings++;
    if (!r[4] || r[4].trim() === '') missingIngredients++;
    if (!r[13] || r[13].trim() === '') missingInstructions++;
  }

  console.log('\n--- Missing Field Statistics across all records ---');
  console.log('Total recipes:', rows.length - 1);
  console.log('Recipes with 0 or missing PrepTime:', missingPrep);
  console.log('Recipes with 0 or missing CookTime:', missingCook);
  console.log('Recipes with 0 or missing Servings:', missingServings);
  console.log('Recipes with missing TranslatedIngredients:', missingIngredients);
  console.log('Recipes with missing TranslatedInstructions:', missingInstructions);
}
