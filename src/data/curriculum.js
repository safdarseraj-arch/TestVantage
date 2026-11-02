/**
 * Subject → Section → Chapter → Topics[]
 * @type {Record<string, Record<string, Record<string, string[]>>>}
 */
export const CURRICULUM_TREE = {
  physics: {
    Mechanics: {
      'Units & Dimensions': ['Dimensional analysis', 'Errors & measurement'],
      Kinematics: ['1D motion', '2D motion', 'Projectile motion', 'Relative velocity'],
      'Laws of Motion': ['Newton’s laws', 'Friction', 'Circular dynamics'],
      'Work, Energy & Power': ['Work', 'Energy', 'Power', 'Collisions'],
      Rotation: ['Torque', 'Angular momentum', 'Rolling motion'],
      Gravitation: ['Universal law', 'Kepler’s laws', 'Satellites'],
      Vectors: ['Addition', 'Dot & cross product', 'Applications'],
    },
    'Properties of Matter': {
      Elasticity: ['Stress & strain', 'Young’s modulus'],
      'Fluid Mechanics': ['Pressure', 'Bernoulli', 'Viscosity'],
      'Surface Tension': ['Surface energy', 'Capillarity'],
    },
    Thermodynamics: {
      'Heat Transfer': ['Conduction', 'Convection', 'Radiation'],
      'Kinetic Theory': ['Gas laws', 'Mean free path'],
      'Laws of Thermodynamics': ['First law', 'Second law', 'Entropy'],
    },
    'Oscillations & Waves': {
      'Simple Harmonic Motion': ['Equations', 'Energy in SHM', 'Pendulum'],
      'Wave Motion': ['Progressive waves', 'Standing waves'],
      Sound: ['Doppler effect', 'Beats', 'Resonance'],
    },
    Optics: {
      'Ray Optics': ['Reflection', 'Refraction', 'Lenses', 'Mirrors'],
      'Wave Optics': ['Interference', 'Diffraction', 'Polarisation'],
      'Optical Instruments': ['Microscope', 'Telescope'],
    },
    'Electricity & Magnetism': {
      Electrostatics: ['Coulomb’s law', 'Field & potential', 'Capacitors'],
      'Current Electricity': ['Ohm’s law', 'Kirchhoff', 'Wheatstone bridge'],
      'Magnetic Effects': ['Biot–Savart', 'Force on conductor'],
      Magnetism: ['Bar magnet', 'Earth’s magnetism'],
      'Electromagnetic Induction': ['Faraday’s law', 'Lenz’s law', 'Inductance'],
      'AC Circuits': ['Phasors', 'LCR', 'Power in AC'],
    },
    'Modern Physics': {
      'Photoelectric Effect': ['Einstein equation', 'Stopping potential'],
      'Atoms & Nuclei': ['Bohr model', 'Radioactivity', 'Nuclear reactions'],
      'Semiconductor Devices': ['Diodes', 'Transistors', 'Logic gates'],
    },
  },
  chemistry: {
    'Physical Chemistry': {
      'Atomic Structure': ['Bohr model', 'Quantum numbers', 'Electronic configuration'],
      'Chemical Bonding': ['Ionic', 'Covalent', 'VSEPR', 'Hybridisation'],
      'States of Matter': ['Gases', 'Liquids', 'Solids'],
      Thermodynamics: ['Enthalpy', 'Gibbs energy', 'Spontaneity'],
      Equilibrium: ['Chemical equilibrium', 'Le Chatelier', 'Ionic equilibrium'],
      'Ionic Equilibrium': ['pH', 'Buffers', 'Hydrolysis'],
      Redox: ['Oxidation number', 'Balancing redox'],
      Electrochemistry: ['Nernst equation', 'Cells', 'Conductance'],
      'Chemical Kinetics': ['Rate law', 'Order', 'Activation energy'],
      'Surface Chemistry': ['Adsorption', 'Colloids', 'Catalysis'],
    },
    'Inorganic Chemistry': {
      'Periodic Table': ['Trends', 'Periodicity'],
      's-Block': ['Alkali metals', 'Alkaline earth metals'],
      'p-Block': ['Group 13–18 elements'],
      'd & f Block': ['Transition metals', 'Lanthanoids & actinoids'],
      'Coordination Compounds': ['Nomenclature', 'Isomerism', 'CFT'],
      Metallurgy: ['Extraction', 'Refining'],
    },
    'Organic Chemistry': {
      'Basics & Nomenclature': ['IUPAC', 'Isomerism', 'Reaction mechanisms'],
      Hydrocarbons: ['Alkanes', 'Alkenes', 'Alkynes', 'Arenes'],
      'Haloalkanes & Haloarenes': ['SN1/SN2', 'Elimination'],
      'Alcohols, Phenols & Ethers': ['Preparation', 'Reactions'],
      'Aldehydes & Ketones': ['Nucleophilic addition', 'Aldol'],
      'Carboxylic Acids': ['Acidity', 'Reactions'],
      Amines: ['Basicity', 'Diazonium salts'],
      Biomolecules: ['Carbohydrates', 'Proteins', 'Vitamins'],
      Polymers: ['Addition', 'Condensation'],
    },
  },
  mathematics: {
    Algebra: {
      'Sets & Relations': ['Sets', 'Relations', 'Functions'],
      'Complex Numbers': ['Modulus', 'Argument', 'De Moivre’s theorem'],
      'Quadratic Equations': ['Nature of roots', 'Sum & product of roots'],
      'Sequences & Series': ['AP', 'GP', 'HP', 'Special series'],
      'Binomial Theorem': ['General term', 'Greatest term', 'Middle term', 'Properties'],
      'Matrices & Determinants': ['Operations', 'Determinants', 'Inverse'],
      'Permutations & Combinations': ['Permutations', 'Combinations', 'Circular permutation'],
    },
    Trigonometry: {
      'Trigonometric Ratios': ['Basic ratios', 'Allied angles'],
      Identities: ['Sum & difference', 'Multiple angles'],
      Equations: ['General solutions', 'Principal solutions'],
      'Inverse Trigonometry': ['Properties', 'Equations'],
    },
    'Coordinate Geometry': {
      'Straight Lines': ['Distance', 'Angle', 'Family of lines'],
      Circles: ['Standard form', 'Tangents', 'Chords'],
      Parabola: ['Standard forms', 'Tangents', 'Normals'],
      Ellipse: ['Standard form', 'Tangents', 'Eccentricity'],
      Hyperbola: ['Standard form', 'Asymptotes', 'Rectangular hyperbola'],
    },
    Calculus: {
      Limits: ['Algebraic limits', 'L’Hôpital', 'Sandwich theorem'],
      Continuity: ['Types of discontinuity', 'Intermediate value'],
      Differentiation: ['Rules', 'Implicit', 'Parametric'],
      'Applications of Derivatives': ['Monotonicity', 'Maxima & minima', 'Tangents'],
      Integration: ['Substitution', 'Parts', 'Partial fractions'],
      'Differential Equations': ['Order & degree', 'Variable separable', 'Linear DE'],
    },
    'Vectors & 3D': {
      Vectors: ['Addition', 'Dot product', 'Cross product', 'Projection'],
      '3D Geometry': ['Direction cosines', 'Lines', 'Planes', 'Distance'],
    },
    'Probability & Statistics': {
      Probability: ['Conditional', 'Bayes', 'Binomial distribution'],
      Statistics: ['Mean', 'Median', 'Variance', 'Regression'],
    },
  },
  biology: {
    'Diversity in Living World': {
      Classification: ['Taxonomy', 'Five kingdoms'],
      'Plant Kingdom': ['Algae', 'Bryophytes', 'Pteridophytes', 'Gymnosperms'],
      'Animal Kingdom': ['Non-chordates', 'Chordates'],
    },
    'Structural Organisation': {
      Morphology: ['Flowering plants', 'Animal tissues'],
      Anatomy: ['Plant tissues', 'Animal organs'],
      'Cell Structure': ['Organelles', 'Cell membrane'],
    },
    'Cell Biology': {
      Biomolecules: ['Carbohydrates', 'Proteins', 'Lipids', 'Nucleic acids'],
      'Cell Cycle': ['Mitosis', 'Meiosis'],
      Enzymes: ['Mechanism', 'Regulation'],
    },
    'Plant Physiology': {
      Photosynthesis: ['Light reaction', 'Calvin cycle'],
      Respiration: ['Glycolysis', 'Krebs cycle', 'ETC'],
      'Plant Growth': ['Auxins', 'Photoperiodism'],
    },
    'Human Physiology': {
      Digestion: ['Enzymes', 'Absorption'],
      Breathing: ['Mechanism', 'Gas exchange'],
      Circulation: ['Heart', 'Blood vessels', 'ECG'],
      Excretion: ['Nephron', 'Osmoregulation'],
      'Neural Control': ['Neuron', 'Reflex arc', 'Brain'],
      'Chemical Coordination': ['Endocrine glands', 'Hormones'],
    },
    Reproduction: {
      'Reproduction in Organisms': ['Asexual', 'Sexual'],
      'Human Reproduction': ['Male & female systems', 'Gametogenesis'],
      'Reproductive Health': ['Contraception', 'STDs'],
    },
    Genetics: {
      'Mendelian Genetics': ['Monohybrid', 'Dihybrid', 'Linkage'],
      'Molecular Basis of Inheritance': ['DNA', 'Replication', 'Transcription'],
      Evolution: ['Darwinism', 'Hardy–Weinberg'],
    },
    Ecology: {
      'Organisms & Environment': ['Adaptations', 'Population'],
      Ecosystem: ['Food chains', 'Energy flow', 'Pyramids'],
      Biodiversity: ['Conservation', 'Hotspots'],
    },
    Biotechnology: {
      'Principles & Processes': ['Recombinant DNA', 'PCR', 'Gel electrophoresis'],
      Applications: ['GM crops', 'Gene therapy', 'Biopiracy'],
    },
  },
  botany: {
    'Diversity in Living World': {
      Classification: ['Taxonomy', 'Five kingdoms'],
      'Plant Kingdom': ['Algae', 'Bryophytes', 'Pteridophytes', 'Gymnosperms', 'Angiosperms'],
    },
    'Structural Organisation': {
      'Plant Morphology': ['Root', 'Stem', 'Leaf', 'Inflorescence', 'Flower'],
      'Plant Anatomy': ['Tissues', 'Secondary growth'],
      'Cell Structure': ['Organelles', 'Cell wall', 'Plasmodesmata'],
    },
    'Cell Biology': {
      Biomolecules: ['Carbohydrates', 'Proteins', 'Lipids', 'Nucleic acids'],
      'Cell Cycle': ['Mitosis', 'Meiosis'],
      Enzymes: ['Mechanism', 'Regulation'],
    },
    'Plant Physiology': {
      Photosynthesis: ['Light reaction', 'Calvin cycle', 'C4 pathway'],
      Respiration: ['Glycolysis', 'Krebs cycle', 'ETC'],
      'Plant Growth': ['Auxins', 'Gibberellins', 'Photoperiodism'],
      'Transport in Plants': ['Water potential', 'Transpiration', 'Phloem transport'],
    },
    Reproduction: {
      'Reproduction in Organisms': ['Asexual', 'Sexual', 'Life cycles'],
      'Plant Reproduction': ['Pollination', 'Fertilisation', 'Seed formation'],
    },
    Genetics: {
      'Mendelian Genetics': ['Monohybrid', 'Dihybrid', 'Linkage'],
      'Molecular Basis of Inheritance': ['DNA', 'Replication', 'Transcription'],
    },
    Ecology: {
      'Organisms & Environment': ['Adaptations', 'Population ecology'],
      Ecosystem: ['Food chains', 'Energy flow', 'Pyramids'],
      Biodiversity: ['Conservation', 'Hotspots'],
    },
    Biotechnology: {
      'Principles & Processes': ['Recombinant DNA', 'PCR', 'Gel electrophoresis'],
      Applications: ['GM crops', 'Tissue culture', 'Biofertilisers'],
    },
  },
  zoology: {
    'Diversity in Living World': {
      Classification: ['Taxonomy', 'Binomial nomenclature'],
      'Animal Kingdom': ['Non-chordates', 'Chordates', 'Phylum-wise features'],
    },
    'Structural Organisation': {
      'Animal Tissues': ['Epithelial', 'Connective', 'Muscular', 'Nervous'],
      'Morphology & Anatomy': ['Earthworm', 'Cockroach', 'Frog'],
      'Cell Structure': ['Organelles', 'Cell membrane'],
    },
    'Cell Biology': {
      Biomolecules: ['Carbohydrates', 'Proteins', 'Lipids', 'Nucleic acids'],
      'Cell Cycle': ['Mitosis', 'Meiosis'],
      Enzymes: ['Mechanism', 'Regulation'],
    },
    'Human Physiology': {
      Digestion: ['Enzymes', 'Absorption'],
      Breathing: ['Mechanism', 'Gas exchange'],
      Circulation: ['Heart', 'Blood vessels', 'ECG'],
      Excretion: ['Nephron', 'Osmoregulation'],
      'Neural Control': ['Neuron', 'Reflex arc', 'Brain'],
      'Chemical Coordination': ['Endocrine glands', 'Hormones'],
    },
    Reproduction: {
      'Human Reproduction': ['Male & female systems', 'Gametogenesis'],
      'Reproductive Health': ['Contraception', 'STDs', 'Infertility'],
    },
    Genetics: {
      'Mendelian Genetics': ['Monohybrid', 'Dihybrid', 'Linkage'],
      'Molecular Basis of Inheritance': ['DNA', 'Replication', 'Transcription'],
      Evolution: ['Darwinism', 'Hardy–Weinberg'],
    },
    Ecology: {
      'Organisms & Environment': ['Adaptations', 'Population'],
      Ecosystem: ['Food chains', 'Energy flow', 'Pyramids'],
      Biodiversity: ['Conservation', 'Hotspots'],
    },
    Biotechnology: {
      Applications: ['Gene therapy', 'Transgenic animals', 'Biopiracy'],
    },
  },
}
