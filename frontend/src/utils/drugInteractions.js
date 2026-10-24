/**
 * Drug Interaction Warning System
 * Local lookup table of common drug–drug interactions.
 * Each entry has two generic drug names and a severity + message.
 */

const INTERACTIONS = [
  // Blood thinners
  { drugs: ['warfarin', 'aspirin'], severity: 'high', message: 'Increased bleeding risk. Co-prescription should be monitored closely.' },
  { drugs: ['warfarin', 'ibuprofen'], severity: 'high', message: 'NSAIDs increase bleeding risk with warfarin. Consider alternative pain relief.' },
  { drugs: ['warfarin', 'paracetamol'], severity: 'low', message: 'High-dose paracetamol may enhance warfarin effect. Monitor INR.' },

  // Metformin interactions
  { drugs: ['metformin', 'alcohol'], severity: 'high', message: 'Alcohol increases risk of lactic acidosis with metformin.' },
  { drugs: ['metformin', 'contrast dye'], severity: 'high', message: 'Discontinue metformin 48h before and after contrast procedures.' },

  // ACE Inhibitors + Potassium
  { drugs: ['enalapril', 'potassium'], severity: 'moderate', message: 'Risk of hyperkalemia. Monitor potassium levels.' },
  { drugs: ['ramipril', 'potassium'], severity: 'moderate', message: 'Risk of hyperkalemia. Monitor potassium levels.' },
  { drugs: ['lisinopril', 'potassium'], severity: 'moderate', message: 'Risk of hyperkalemia. Monitor potassium levels.' },

  // Statins
  { drugs: ['atorvastatin', 'erythromycin'], severity: 'high', message: 'Increased risk of myopathy/rhabdomyolysis. Consider alternative antibiotic.' },
  { drugs: ['simvastatin', 'amlodipine'], severity: 'moderate', message: 'Simvastatin dose should not exceed 20mg when combined with amlodipine.' },

  // Antibiotics
  { drugs: ['ciprofloxacin', 'antacid'], severity: 'moderate', message: 'Antacids reduce ciprofloxacin absorption. Space doses by 2 hours.' },
  { drugs: ['azithromycin', 'antacid'], severity: 'low', message: 'Antacids may reduce azithromycin absorption. Take on empty stomach.' },
  { drugs: ['metronidazole', 'alcohol'], severity: 'high', message: 'Severe nausea, vomiting, headache. Avoid alcohol during and 48h after treatment.' },
  { drugs: ['doxycycline', 'calcium'], severity: 'moderate', message: 'Calcium reduces doxycycline absorption. Space doses by 2–3 hours.' },
  { drugs: ['doxycycline', 'iron'], severity: 'moderate', message: 'Iron reduces doxycycline absorption. Space doses by 2–3 hours.' },

  // NSAIDs
  { drugs: ['ibuprofen', 'aspirin'], severity: 'moderate', message: 'Ibuprofen may reduce cardioprotective effect of low-dose aspirin.' },
  { drugs: ['diclofenac', 'aspirin'], severity: 'moderate', message: 'Increased GI bleeding risk. Use with caution.' },

  // Cardiac
  { drugs: ['digoxin', 'amiodarone'], severity: 'high', message: 'Amiodarone increases digoxin levels. Reduce digoxin dose by 50%.' },
  { drugs: ['digoxin', 'verapamil'], severity: 'high', message: 'Verapamil increases digoxin levels. Monitor closely.' },

  // CNS
  { drugs: ['diazepam', 'alcohol'], severity: 'high', message: 'Enhanced CNS depression. Risk of respiratory depression.' },
  { drugs: ['tramadol', 'ssri'], severity: 'high', message: 'Risk of serotonin syndrome. Avoid combination.' },
  { drugs: ['tramadol', 'fluoxetine'], severity: 'high', message: 'Risk of serotonin syndrome and seizures.' },

  // Antidiabetics
  { drugs: ['glibenclamide', 'ciprofloxacin'], severity: 'moderate', message: 'Ciprofloxacin may enhance hypoglycemic effect. Monitor blood sugar.' },
  { drugs: ['insulin', 'beta blocker'], severity: 'moderate', message: 'Beta-blockers may mask hypoglycemia symptoms.' },

  // Common Indian pharmacy combos
  { drugs: ['pantoprazole', 'clopidogrel'], severity: 'moderate', message: 'PPIs may reduce clopidogrel efficacy. Consider using rabeprazole instead.' },
  { drugs: ['omeprazole', 'clopidogrel'], severity: 'high', message: 'Omeprazole significantly reduces clopidogrel activation. Avoid combination.' },
  { drugs: ['cetirizine', 'alcohol'], severity: 'low', message: 'Increased drowsiness. Advise caution while driving.' },
];

// Common brand → generic name mapping (Indian market)
const BRAND_TO_GENERIC = {
  'dolo': 'paracetamol', 'dolo 650': 'paracetamol', 'crocin': 'paracetamol', 'calpol': 'paracetamol',
  'combiflam': 'ibuprofen+paracetamol', 'brufen': 'ibuprofen', 'ibugesic': 'ibuprofen',
  'azithral': 'azithromycin', 'azee': 'azithromycin', 'zithromax': 'azithromycin',
  'augmentin': 'amoxicillin+clavulanate', 'amoxyclav': 'amoxicillin+clavulanate',
  'pantocid': 'pantoprazole', 'pan-d': 'pantoprazole+domperidone', 'pan': 'pantoprazole',
  'omez': 'omeprazole', 'omeprazole': 'omeprazole',
  'flagyl': 'metronidazole', 'metrogyl': 'metronidazole',
  'cipro': 'ciprofloxacin', 'ciplox': 'ciprofloxacin',
  'ecosprin': 'aspirin', 'disprin': 'aspirin',
  'glycomet': 'metformin', 'glucophage': 'metformin',
  'telma': 'telmisartan', 'telmikind': 'telmisartan',
  'atorva': 'atorvastatin', 'lipitor': 'atorvastatin',
  'voveran': 'diclofenac', 'volini': 'diclofenac',
  'cetrizine': 'cetirizine', 'okacet': 'cetirizine', 'alerid': 'cetirizine',
  'monocef': 'ceftriaxone',
  'rantac': 'ranitidine',
  'plavix': 'clopidogrel', 'clopilet': 'clopidogrel',
  'corex': 'chlorpheniramine+codeine',
  'allegra': 'fexofenadine',
  'montair': 'montelukast',
  'shelcal': 'calcium',
  'calcimax': 'calcium',
  'livogen': 'iron',
  'digoxin': 'digoxin',
  'amiodarone': 'amiodarone',
};

/**
 * Resolve a medicine name to its generic/active ingredient(s).
 * Returns an array of generic names (some combos have multiple).
 */
function resolveGeneric(medicineName) {
  const name = (medicineName || '').toLowerCase().trim();

  // Direct mapping match
  for (const [brand, generic] of Object.entries(BRAND_TO_GENERIC)) {
    if (name.includes(brand)) {
      return generic.split('+');
    }
  }

  // Check if the name itself IS a generic name
  const allGenerics = new Set(Object.values(BRAND_TO_GENERIC).flatMap(g => g.split('+')));
  for (const generic of allGenerics) {
    if (name.includes(generic)) return [generic];
  }

  return [name]; // fallback: treat the name itself as the generic
}

/**
 * Check for drug interactions in a list of medicine names.
 *
 * @param {string[]} medicineNames - Array of medicine names (brand or generic)
 * @returns {Array<{ drug1: string, drug2: string, severity: string, message: string }>}
 */
export function checkInteractions(medicineNames) {
  if (!medicineNames || medicineNames.length < 2) return [];

  // Resolve all medicines to their generic components
  const resolvedPairs = medicineNames.map(name => ({
    original: name,
    generics: resolveGeneric(name),
  }));

  const warnings = [];
  const seen = new Set();

  for (let i = 0; i < resolvedPairs.length; i++) {
    for (let j = i + 1; j < resolvedPairs.length; j++) {
      const med1 = resolvedPairs[i];
      const med2 = resolvedPairs[j];

      for (const g1 of med1.generics) {
        for (const g2 of med2.generics) {
          for (const interaction of INTERACTIONS) {
            const [d1, d2] = interaction.drugs;
            if ((g1.includes(d1) && g2.includes(d2)) || (g1.includes(d2) && g2.includes(d1))) {
              const key = [med1.original, med2.original].sort().join('|');
              if (!seen.has(key)) {
                seen.add(key);
                warnings.push({
                  drug1: med1.original,
                  drug2: med2.original,
                  severity: interaction.severity,
                  message: interaction.message,
                });
              }
            }
          }
        }
      }
    }
  }

  // Sort: high severity first
  return warnings.sort((a, b) => {
    const order = { high: 0, moderate: 1, low: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });
}

/**
 * Severity badge colors/labels for UI
 */
export function getSeverityConfig(severity) {
  switch (severity) {
    case 'high':
      return { label: 'HIGH RISK', bgColor: 'bg-[#FEF2F2]', textColor: 'text-[#DC2626]', borderColor: 'border-[#FECACA]', icon: '⚠️' };
    case 'moderate':
      return { label: 'MODERATE', bgColor: 'bg-[#FFFBEB]', textColor: 'text-[#D97706]', borderColor: 'border-[#FDE68A]', icon: '⚡' };
    case 'low':
      return { label: 'LOW', bgColor: 'bg-[#F0F9FF]', textColor: 'text-[#0284C7]', borderColor: 'border-[#BAE6FD]', icon: 'ℹ️' };
    default:
      return { label: 'INFO', bgColor: 'bg-surface-50', textColor: 'text-surface-600', borderColor: 'border-surface-200', icon: 'ℹ️' };
  }
}
