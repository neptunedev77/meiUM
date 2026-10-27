/*
 * Catálogo de unidades curriculares e temas — a única fonte da navegação.
 *
 * Para acrescentar um tema:   1. criar o ficheiro HTML (copiar templates/topic.html)
 *                             2. mudar o "status" do tema para "ready" (ou acrescentar uma entrada)
 * Para acrescentar uma UC:    1. criar a pasta <id>/ com index.html (copiar daa/index.html e mudar data-uc)
 *                             2. acrescentar a UC abaixo, com um "hue" (0–360) para a cor de destaque
 */
window.CATALOG = {
  site: {
    name: 'meiUM', year: '2026/2027',
    tagline: 'Apontamentos do Mestrado em Engenharia Informática · Universidade do Minho',
    tagline_en: 'Notes from the MSc in Informatics Engineering · University of Minho'
  },
  ucs: [
    {
      id: 'daa',
      code: 'DAA',
      name: 'Dados e Aprendizagem Automática',
      en: 'Data and Machine Learning',
      year: '2026/2027',
      hue: 172,
      desc: 'Fundamentos de ciência de dados e Machine Learning: estatística descritiva, validação de modelos, preparação de dados, regressão, feature engineering, árvores de decisão e ensembles.',
      desc_en: 'Foundations of data science and Machine Learning: descriptive statistics, model validation, data preparation, regression, feature engineering, decision trees and ensembles.',
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
    },
    {
      id: 'ascn',
      code: 'ASCN',
      name: 'Aplicações e Serviços de Computação em Nuvem',
      en: 'Cloud Computing Applications and Services',
      year: '2026/2027',
      hue: 225,
      desc: 'Como se desenham, instalam e operam aplicações na cloud: DevOps e infraestrutura como código, arquiteturas distribuídas, provisionamento com Ansible, modelos IaaS/PaaS/SaaS e virtualização.',
      desc_en: 'How applications are designed, deployed and operated in the cloud: DevOps and infrastructure as code, distributed architectures, provisioning with Ansible, IaaS/PaaS/SaaS models and virtualisation.',
      topics: [
        { id: '01', file: '01-introduction.html', title: 'Introdução: DevOps e Infraestrutura como Código', en: 'Introduction', status: 'ready', source: '1 - Introduction' },
        { id: '02', file: '02-distributed-applications.html', title: 'Aplicações Distribuídas', en: 'Distributed Applications', status: 'ready', source: '2 - Distributed Applications' },
        { id: '03', file: '03-system-provisioning.html', title: 'Provisionamento de Sistemas', en: 'System Provisioning', status: 'ready', source: '3 - System Provisioning' },
        { id: '04', file: '04-cloud-computing.html', title: 'Computação em Nuvem', en: 'Cloud Computing', status: 'ready', source: '4 - Cloud Computing' },
        { id: '05', file: '05-virtualization-vms.html', title: 'Virtualização: Máquinas Virtuais', en: 'Virtualization (Part I): VMs', status: 'ready', source: '5 - Virtualization Part 1' }
      ]
    }
  ]
};
