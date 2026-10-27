/*
 * Catálogo de unidades curriculares e temas — a única fonte da navegação.
 *
 * Para acrescentar um tema:   1. criar o ficheiro HTML (copiar templates/topic.html)
 *                             2. mudar o "status" do tema para "ready" (ou acrescentar uma entrada)
 * Para acrescentar uma UC:    1. criar a pasta <id>/ com index.html (copiar daa/index.html e mudar data-uc)
 *                             2. acrescentar a UC abaixo, com um "hue" (0–360) para a cor de destaque
 */
window.CATALOG = {
  site: { name: 'meiUM', tagline: 'Apontamentos do Mestrado em Engenharia Informática · Universidade do Minho' },
  ucs: [
    {
      id: 'daa',
      code: 'DAA',
      name: 'Dados e Aprendizagem Automática',
      en: 'Data and Machine Learning',
      year: '2026/2027',
      hue: 172,
      desc: 'Fundamentos de ciência de dados e Machine Learning: estatística descritiva, validação de modelos, preparação de dados, regressão, feature engineering, árvores de decisão e ensembles.',
      staff: 'Filipa Ferraz, Victor Alves, Dalila Durães, Francisco Marcondes, Guilherme Barbosa',
      topics: [
        { id: '01', file: '01-data-science-concepts.html', title: 'Conceitos de Ciência de Dados', en: 'Introduction to Data Science Concepts', status: 'ready', source: 'DAA_PL_1' },
        { id: '02', file: '02-quality-metrics.html', title: 'Métricas de Qualidade e Validação de Modelos', en: 'Quality Metrics and Model Validation', status: 'ready', source: 'DAA_PL_2' },
        { id: '03', file: '03-data-exploration.html', title: 'Exploração e Preparação de Dados', en: 'Data Exploration and Preparation', status: 'ready', source: 'DAA_PL_3' },
        { id: '04', file: '04-regression.html', title: 'Regressão Linear e Logística', en: 'Linear and Logistic Regression', status: 'ready', source: 'DAA_PL_4' },
        { id: '05', file: '05-feature-engineering.html', title: 'Feature Engineering', en: 'Feature Engineering', status: 'ready', source: 'DAA_PL_5' },
        { id: '06', file: '06-decision-trees.html', title: 'Poda de Árvores e Afinação de Hiperparâmetros', en: 'Decision Tree Pruning and Hyperparameter Tuning', status: 'ready', source: 'DAA_PL_5' },
        { id: '07', file: '07-ensemble-learning.html', title: 'Ensemble Learning', en: 'Ensemble Learning', status: 'ready', source: 'DAA_PL_6' }
      ]
    }
  ]
};
