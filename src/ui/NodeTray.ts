import type { BuildingType } from '../entities/Building';
import type { Nodeling } from '../entities/Nodeling';

// ── Types ────────────────────────────────────────────────────────────────────

interface SuperNodeConfig {
  label: string;
  type: BuildingType;
  desc: string;
}

interface SuperNode {
  label: string;
  accent: string;
  svg: string;
  description: string;
  configs: SuperNodeConfig[];
}

interface NodelingRole {
  name: string;
  color: string;
  desc: string;
}

interface RoleCategory {
  category: string;
  accent: string;
  roles: NodelingRole[];
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── SVG icons (Lucide-style, stroke only) ────────────────────────────────────

const icon = (paths: string) =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const ICONS: Record<string, string> = {
  pull:      icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  push:      icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  think:     icon('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>'),
  decide:    icon('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
  transform: icon('<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>'),
  store:     icon('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>'),
  wait:      icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  sparky:    icon('<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'),
};

// ── Colors ───────────────────────────────────────────────────────────────────

const CYAN   = '#2dd4bf';
const VIOLET = '#a78bfa';
const AMBER  = '#fbbf24';

// ── Supernodes ───────────────────────────────────────────────────────────────

const SUPERNODES_ACT: SuperNode[] = [
  {
    label: 'Pull',
    accent: CYAN,
    svg: ICONS.pull,
    description: 'Reads and fetches data from an external source',
    configs: [
      { label: 'Inbox',    type: 'webhook',        desc: 'External payloads, manual input' },
      { label: 'Gmail',    type: 'gmail',           desc: 'Emails, threads, attachments' },
      { label: 'Slack',    type: 'slack',           desc: 'Messages, mentions, channels' },
      { label: 'Notion',   type: 'notion',          desc: 'Pages, databases, blocks' },
      { label: 'Sheets',   type: 'google_sheets',   desc: 'Rows, cells, ranges' },
      { label: 'Airtable', type: 'airtable',        desc: 'Records, views' },
      { label: 'Web',      type: 'scraper',         desc: 'Web pages, search results' },
      { label: 'API',      type: 'http_request',    desc: 'Any REST endpoint' },
    ],
  },
  {
    label: 'Push',
    accent: CYAN,
    svg: ICONS.push,
    description: 'Writes and sends data to an external destination',
    configs: [
      { label: 'Deploy',   type: 'deploy_node',     desc: 'Trigger a release pipeline' },
      { label: 'API',      type: 'http_request',    desc: 'POST/PUT to any endpoint' },
      { label: 'Gmail',    type: 'gmail',           desc: 'Send email, save draft' },
      { label: 'Slack',    type: 'slack',           desc: 'Post message, react' },
      { label: 'Notion',   type: 'notion',          desc: 'Create or update page' },
      { label: 'Sheets',   type: 'google_sheets',   desc: 'Write rows, update cells' },
      { label: 'Airtable', type: 'airtable',        desc: 'Create or update records' },
    ],
  },
  {
    label: 'Think',
    accent: VIOLET,
    svg: ICONS.think,
    description: 'AI reasoning, classification, and generation',
    configs: [
      { label: 'Reason',    type: 'ai_agent',   desc: 'General-purpose AI reasoning and planning' },
      { label: 'Summarize', type: 'llm_node',   desc: 'Condense long content into a summary' },
      { label: 'Classify',  type: 'llm_node',   desc: 'Label by sentiment, category, or intent' },
      { label: 'Rewrite',   type: 'llm_chain',  desc: 'Tone adjustment, humanization, style transfer' },
      { label: 'Gen Image', type: 'image_gen',  desc: 'Text-to-image generation' },
      { label: 'Embed',     type: 'gpu_core',   desc: 'Vector embeddings for semantic search' },
    ],
  },
];

const SUPERNODES_FLOW: SuperNode[] = [
  {
    label: 'Decide',
    accent: AMBER,
    svg: ICONS.decide,
    description: 'Branch the workflow based on a condition',
    configs: [
      { label: 'If / Else',  type: 'if_node',     desc: 'Boolean condition on the payload' },
      { label: 'Switch',     type: 'switch_node',  desc: 'Multi-way routing by field value' },
    ],
  },
  {
    label: 'Transform',
    accent: AMBER,
    svg: ICONS.transform,
    description: 'Reshape, filter, or manipulate data',
    configs: [
      { label: 'Map',     type: 'set_node',   desc: 'Rename and restructure fields' },
      { label: 'Filter',  type: 'set_node',   desc: 'Pass or reject items by criteria' },
      { label: 'Combine', type: 'merge_node', desc: 'Merge multiple items into one' },
      { label: 'Code',    type: 'code_node',  desc: 'Custom JavaScript or Python' },
    ],
  },
  {
    label: 'Store',
    accent: AMBER,
    svg: ICONS.store,
    description: 'Persistent memory across runs and nodelings',
    configs: [
      { label: 'Memory', type: 'set_node',  desc: 'Key-value pairs shared between workers' },
      { label: 'Queue',  type: 'set_node',  desc: 'Ordered buffer for batching' },
      { label: 'Log',    type: 'set_node',  desc: 'Append-only record of events' },
    ],
  },
  {
    label: 'Wait',
    accent: AMBER,
    svg: ICONS.wait,
    description: 'Pause until a time or condition is met',
    configs: [
      { label: 'Timer',    type: 'wait_node', desc: 'Pause for a set duration' },
      { label: 'Schedule', type: 'schedule',  desc: 'Pause until a specific time or cron' },
    ],
  },
];

// ── Nodeling Roles ───────────────────────────────────────────────────────────

const NODELING_ROLES: RoleCategory[] = [
  {
    category: 'Creative',
    accent: '#ec4899',
    roles: [
      { name: 'Graphic Designer',  color: '#ec4899', desc: 'Visual assets, image gen, design variations' },
      { name: 'Content Writer',    color: '#a855f7', desc: 'Research, outline, draft, polish content' },
      { name: 'Copywriter',        color: '#f43f5e', desc: 'Ads, headlines, email subjects, captions' },
      { name: 'Video Editor',      color: '#b91c1c', desc: 'Scripts, shot lists, descriptions, metadata' },
    ],
  },
  {
    category: 'Strategy',
    accent: '#6366f1',
    roles: [
      { name: 'Project Manager',   color: '#6366f1', desc: 'Track progress, find blockers, send updates' },
      { name: 'Product Manager',   color: '#3b82f6', desc: 'Gather feedback, prioritize, write specs' },
      { name: 'Art Director',      color: '#eab308', desc: 'Review creative, maintain brand consistency' },
      { name: 'Scrum Master',      color: '#14b8a6', desc: 'Standups, velocity tracking, spot blockers' },
    ],
  },
  {
    category: 'Marketing',
    accent: '#f472b6',
    roles: [
      { name: 'Social Media Mgr',  color: '#f472b6', desc: 'Adapt per platform, schedule, engage' },
      { name: 'SEO Specialist',    color: '#22c55e', desc: 'Keywords, content optimization, rankings' },
      { name: 'Email Marketer',    color: '#38bdf8', desc: 'Campaigns, segmentation, A/B testing' },
    ],
  },
  {
    category: 'Engineering',
    accent: '#0d9488',
    roles: [
      { name: 'Game Designer',     color: '#f59e0b', desc: 'Design docs, mechanics balance, specs' },
      { name: 'Software Engineer', color: '#0d9488', desc: 'Code, PRs, reviews, implementation' },
      { name: 'QA Tester',         color: '#ef4444', desc: 'Test cases, edge cases, bug reports' },
      { name: 'DevOps Engineer',   color: '#ea580c', desc: 'Monitor infra, triage alerts, incidents' },
    ],
  },
  {
    category: 'Operations',
    accent: '#06b6d4',
    roles: [
      { name: 'Support Rep',       color: '#06b6d4', desc: 'Classify tickets, draft replies, escalate' },
      { name: 'Recruiter',         color: '#c084fc', desc: 'Screen candidates, evaluate fit, schedule' },
      { name: 'Exec Assistant',    color: '#94a3b8', desc: 'Manage inbox, triage comms, schedule' },
    ],
  },
  {
    category: 'Research',
    accent: '#f97316',
    roles: [
      { name: 'Data Analyst',      color: '#f97316', desc: 'Pull data, calculate, interpret, report' },
      { name: 'Research Analyst',  color: '#16a34a', desc: 'Search sources, synthesize, report' },
    ],
  },
];

// ── NodeTray Class ───────────────────────────────────────────────────────────

export class NodeTray {
  private container: HTMLElement;
  private element: HTMLElement;
  private onSelectNode: (type: BuildingType) => void;
  private onDeselectNode: () => void;
  private onSpawnNodeling: (name: string, color?: string) => void;
  private onToggleEraser: () => void;
  private onActivateMove: () => void;
  private onActivatePath: () => void;
  private getNodelings: () => Nodeling[];
  private onSelectNodeling: (nodeling: Nodeling) => void;
  private onDeleteNodeling: (nodeling: Nodeling) => void;
  private selectedType: BuildingType | null = null;
  private activeTab: 'nodes' | 'nodelings' | null = null;
  private panelEl: HTMLElement;
  private tabsEl: HTMLElement;
  private eraserBtn: HTMLElement;
  private moveBtn: HTMLElement;
  private pathBtn: HTMLElement;
  private tooltipEl: HTMLElement;

  constructor(
    overlay: HTMLElement,
    onSelectNode: (type: BuildingType) => void,
    onDeselectNode: () => void,
    onSpawnNodeling: (name: string, color?: string) => void,
    onToggleEraser: () => void,
    getNodelings: () => Nodeling[],
    onSelectNodeling: (nodeling: Nodeling) => void,
    onDeleteNodeling: (nodeling: Nodeling) => void,
    onActivateMove: () => void,
    onActivatePath: () => void,
  ) {
    this.container = overlay;
    this.onSelectNode = onSelectNode;
    this.onDeselectNode = onDeselectNode;
    this.onSpawnNodeling = onSpawnNodeling;
    this.onToggleEraser = onToggleEraser;
    this.onActivateMove = onActivateMove;
    this.onActivatePath = onActivatePath;
    this.getNodelings = getNodelings;
    this.onSelectNodeling = onSelectNodeling;
    this.onDeleteNodeling = onDeleteNodeling;

    this.element = document.createElement('div');
    this.element.className = 'ntray';

    // Panel (slides up above tabs)
    this.panelEl = document.createElement('div');
    this.panelEl.className = 'ntray-panel';
    this.panelEl.style.display = 'none';
    this.element.appendChild(this.panelEl);

    // Tab bar
    this.tabsEl = document.createElement('div');
    this.tabsEl.className = 'ntray-tabs';
    this.tabsEl.innerHTML = `
      <button class="ntray-tab" data-tab="nodes" title="Nodes">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      </button>
      <button class="ntray-tab" data-tab="nodelings" title="Nodelings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
      </button>
      <div class="ntray-divider"></div>
      <button class="ntray-tab ntray-tool" data-tool="move" title="Move a worker">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
      </button>
      <button class="ntray-tab ntray-tool" data-tool="path" title="Set a path">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M5 17c0-6 5-5 7-8s3-4 7-2"/></svg>
      </button>
      <button class="ntray-tab ntray-eraser" data-tab="eraser">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
      </button>
    `;
    this.eraserBtn = this.tabsEl.querySelector('.ntray-eraser')!;
    this.moveBtn   = this.tabsEl.querySelector('[data-tool="move"]')!;
    this.pathBtn   = this.tabsEl.querySelector('[data-tool="path"]')!;
    this.element.appendChild(this.tabsEl);

    // Wire tab clicks
    this.tabsEl.querySelectorAll('.ntray-tab:not(.ntray-eraser):not(.ntray-tool)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tab = (btn as HTMLElement).dataset.tab as 'nodes' | 'nodelings';
        this.toggleTab(tab);
      });
    });

    this.eraserBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePanel();
      this.onToggleEraser();
    });
    this.moveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePanel();
      this.onActivateMove();
    });
    this.pathBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePanel();
      this.onActivatePath();
    });

    document.addEventListener('click', (e) => {
      if (!this.element.contains(e.target as Node)) {
        this.closePanel();
      }
    });

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'ntray-tooltip';
    this.tooltipEl.style.display = 'none';
    // Tray UI removed — nodelings build workflows via instructions instead
  }

  private toggleTab(tab: 'nodes' | 'nodelings') {
    if (this.activeTab === tab) {
      this.closePanel();
      return;
    }
    this.activeTab = tab;
    this.updateTabHighlight();
    if (tab === 'nodes') this.buildNodesPanel();
    else                  this.buildNodelingsPanel();
    this.panelEl.style.display = '';
    this.element.classList.add('ntray-open');
  }

  private closePanel() {
    this.activeTab = null;
    this.panelEl.style.display = 'none';
    this.panelEl.innerHTML = '';
    this.element.classList.remove('ntray-open');
    this.updateTabHighlight();
  }

  private updateTabHighlight() {
    this.tabsEl.querySelectorAll('.ntray-tab').forEach(btn => {
      const isActive = (btn as HTMLElement).dataset.tab === this.activeTab;
      btn.classList.toggle('active', isActive);
    });
  }

  // ── Nodes panel (supernodes with expandable configs) ──

  private buildNodesPanel() {
    this.panelEl.innerHTML = '';

    const allConfigAreas: HTMLElement[] = [];
    const allButtons: HTMLElement[] = [];
    let expanded: string | null = null;

    const groups = [
      { name: 'Act', nodes: SUPERNODES_ACT },
      { name: 'Flow', nodes: SUPERNODES_FLOW },
    ];

    for (const group of groups) {
      const section = document.createElement('div');
      section.className = 'ntray-category';

      const heading = document.createElement('div');
      heading.className = 'ntray-cat-name';
      heading.textContent = group.name;
      section.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'ntray-grid';
      grid.style.gridTemplateColumns = `repeat(${group.nodes.length}, 1fr)`;

      const configsArea = document.createElement('div');
      configsArea.className = 'ntray-configs';
      configsArea.style.display = 'none';
      allConfigAreas.push(configsArea);

      for (const sn of group.nodes) {
        const btn = document.createElement('button');
        btn.className = 'ntray-item';
        const iconBg = hexToRgba(sn.accent, 0.12);
        btn.innerHTML = `
          <div class="ntray-item-icon-bg" style="background:${iconBg}; color:${sn.accent}">${sn.svg}</div>
          <div class="ntray-item-label">${sn.label}</div>
        `;
        allButtons.push(btn);

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const wasExpanded = expanded === sn.label;
          // Collapse everything
          allConfigAreas.forEach(a => a.style.display = 'none');
          allButtons.forEach(b => b.classList.remove('selected'));

          if (wasExpanded) {
            expanded = null;
          } else {
            expanded = sn.label;
            btn.classList.add('selected');
            this.renderConfigs(configsArea, sn);
          }
        });

        btn.addEventListener('mouseenter', () => {
          this.tooltipEl.textContent = sn.description;
          this.tooltipEl.style.display = 'block';
          const rect = btn.getBoundingClientRect();
          this.tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
          this.tooltipEl.style.top = `${rect.top - 6}px`;
        });
        btn.addEventListener('mouseleave', () => {
          this.tooltipEl.style.display = 'none';
        });

        grid.appendChild(btn);
      }

      section.appendChild(grid);
      section.appendChild(configsArea);
      this.panelEl.appendChild(section);
    }
  }

  private renderConfigs(container: HTMLElement, sn: SuperNode) {
    container.innerHTML = '';
    container.style.display = 'flex';

    for (const config of sn.configs) {
      const chip = document.createElement('button');
      chip.className = 'ntray-config-chip';
      chip.innerHTML = `
        <span class="ntray-config-dot" style="background:${sn.accent}"></span>
        <span>${config.label}</span>
      `;

      chip.addEventListener('mouseenter', () => {
        this.tooltipEl.textContent = config.desc;
        this.tooltipEl.style.display = 'block';
        const rect = chip.getBoundingClientRect();
        this.tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
        this.tooltipEl.style.top = `${rect.top - 6}px`;
      });
      chip.addEventListener('mouseleave', () => {
        this.tooltipEl.style.display = 'none';
      });

      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(config.type);
        this.onSelectNode(config.type);
        this.closePanel();
      });

      container.appendChild(chip);
    }
  }

  // ── Nodelings panel (active workers + role hiring) ──

  private buildNodelingsPanel() {
    this.panelEl.innerHTML = '';
    const nodelings = this.getNodelings();
    const awake = nodelings.filter(n => n.state !== 'dormant');

    // Active workers list
    if (awake.length > 0) {
      const section = document.createElement('div');
      section.className = 'ntray-category';

      const heading = document.createElement('div');
      heading.className = 'ntray-cat-name';
      heading.textContent = `Active (${awake.length})`;
      section.appendChild(heading);

      const list = document.createElement('div');
      list.className = 'ntray-worker-list';

      for (const nodeling of awake) {
        const row = document.createElement('div');
        row.className = 'ntray-worker-row';
        const stateLabel = this.getStateLabel(nodeling);
        const stateColor = this.getStateColor(nodeling);
        const roleColor = nodeling.baseColor || '#4ecdc4';
        row.innerHTML = `
          <div class="ntray-worker-icon" style="color:${roleColor}">${ICONS.sparky}</div>
          <div class="ntray-worker-info">
            <div class="ntray-worker-name">${nodeling.name}</div>
            <div class="ntray-worker-status" style="color:${stateColor}">${stateLabel}</div>
          </div>
          <div class="ntray-worker-actions">
            <button class="ntray-worker-btn ntray-worker-settings" title="Instruct">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </button>
            <button class="ntray-worker-btn ntray-worker-delete" title="Remove">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>
          </div>
        `;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          if ((e.target as HTMLElement).closest('.ntray-worker-btn')) return;
          this.onSelectNodeling(nodeling);
          this.closePanel();
        });
        row.querySelector('.ntray-worker-settings')!.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onSelectNodeling(nodeling);
          this.closePanel();
        });
        row.querySelector('.ntray-worker-delete')!.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onDeleteNodeling(nodeling);
          this.buildNodelingsPanel();
        });
        list.appendChild(row);
      }
      section.appendChild(list);
      this.panelEl.appendChild(section);
    }

    // Hire section
    const hireSection = document.createElement('div');
    hireSection.className = 'ntray-category';

    if (awake.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'ntray-spawn-divider';
      hireSection.appendChild(divider);
    }

    const hireHeading = document.createElement('div');
    hireHeading.className = 'ntray-cat-name';
    hireHeading.textContent = 'Hire a Worker';
    hireSection.appendChild(hireHeading);

    for (const cat of NODELING_ROLES) {
      const groupEl = document.createElement('div');
      groupEl.className = 'ntray-role-group';

      const groupName = document.createElement('div');
      groupName.className = 'ntray-role-group-name';
      groupName.style.color = cat.accent;
      groupName.textContent = cat.category;
      groupEl.appendChild(groupName);

      const rolesGrid = document.createElement('div');
      rolesGrid.className = 'ntray-roles-grid';

      for (const role of cat.roles) {
        const card = document.createElement('button');
        card.className = 'ntray-role-card';
        card.innerHTML = `
          <div class="ntray-role-dot" style="background:${role.color}; box-shadow: 0 0 8px ${hexToRgba(role.color, 0.4)}"></div>
          <div class="ntray-role-info">
            <div class="ntray-role-name">${role.name}</div>
            <div class="ntray-role-desc">${role.desc}</div>
          </div>
        `;

        card.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onSpawnNodeling(role.name, role.color);
          this.buildNodelingsPanel();
        });

        rolesGrid.appendChild(card);
      }

      groupEl.appendChild(rolesGrid);
      hireSection.appendChild(groupEl);
    }

    this.panelEl.appendChild(hireSection);
  }

  private getStateLabel(nodeling: Nodeling): string {
    switch (nodeling.state) {
      case 'idle': return nodeling.graph ? 'Idle (has task)' : 'Idle';
      case 'moving': return 'Walking...';
      case 'working': return 'Working...';
      case 'at_node': return 'At building';
      case 'confused': return 'Confused';
      case 'happy': return 'Happy!';
      case 'dormant': return 'Dormant';
      default: return nodeling.state;
    }
  }

  private getStateColor(nodeling: Nodeling): string {
    switch (nodeling.state) {
      case 'idle': return '#4ecdc4';
      case 'moving': return '#45b7d1';
      case 'working': return '#f7dc6f';
      case 'at_node': return '#a78bfa';
      case 'confused': return '#e74c3c';
      case 'happy': return '#2ecc71';
      case 'dormant': return '#555555';
      default: return '#94a3b8';
    }
  }

  // ── Public API ──

  select(type: BuildingType) { this.selectedType = type; }
  clearSelection() { this.selectedType = null; }
  getSelectedType(): BuildingType | null { return this.selectedType; }
  setEraserActive(active: boolean) { this.eraserBtn.classList.toggle('active', active); }
  setMoveActive(active: boolean) { this.moveBtn.classList.toggle('active', active); }
  setPathActive(active: boolean) { this.pathBtn.classList.toggle('active', active); }
  hide() { this.element.style.display = 'none'; }
  show() { this.element.style.display = ''; }

  // ── Styles ──

  private applyStyles() {
    if (document.getElementById('ntray-styles')) return;
    const style = document.createElement('style');
    style.id = 'ntray-styles';
    style.textContent = `
      /* ── Keyframes ── */
      @keyframes ntray-slide-up {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes ntray-status-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      @keyframes ntray-spawn-shimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      @keyframes ntray-configs-appear {
        from { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
        to   { opacity: 1; max-height: 200px; }
      }

      .ntray {
        position: absolute;
        bottom: clamp(8px, 2vw, 16px);
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        z-index: 30;
        pointer-events: auto;
        max-width: calc(100vw - 16px);
        width: auto;
      }

      /* ── Panel ── */
      .ntray-panel {
        width: min(460px, calc(100vw - 24px));
        max-height: min(420px, 55vh);
        overflow-y: auto;
        overflow-x: hidden;
        background: linear-gradient(180deg, rgba(14,18,30,0.97) 0%, rgba(10,14,24,0.97) 100%);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(78,205,196,0.1);
        border-bottom: none;
        border-radius: 20px 20px 0 0;
        padding: 0 0 8px;
        margin-bottom: -1px;
        box-shadow: 0 -8px 40px rgba(0,0,0,0.55), 0 -2px 24px rgba(78,205,196,0.05), inset 0 1px 0 rgba(255,255,255,0.04);
        animation: ntray-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ntray-panel::-webkit-scrollbar { width: 5px; }
      .ntray-panel::-webkit-scrollbar-track { background: transparent; }
      .ntray-panel::-webkit-scrollbar-thumb {
        background: rgba(78,205,196,0.18);
        border-radius: 3px;
      }

      /* ── Category ── */
      .ntray-category {
        margin-bottom: 4px;
        padding: 0 clamp(12px, 2vw, 18px);
      }
      .ntray-cat-name {
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 10px;
        font-weight: 700;
        color: #4a5568;
        text-transform: uppercase;
        letter-spacing: 1.8px;
        padding: 14px 2px 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .ntray-cat-name::before,
      .ntray-cat-name::after {
        content: '';
        flex: 1;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06));
      }
      .ntray-cat-name::before {
        background: linear-gradient(270deg, transparent, rgba(255,255,255,0.06));
      }

      /* ── Supernode / item grid ── */
      .ntray-grid {
        display: grid;
        gap: 8px;
      }
      .ntray-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 7px;
        padding: 10px 6px 9px;
        background: rgba(255,255,255,0.025);
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        position: relative;
        overflow: hidden;
        box-sizing: border-box;
        width: 100%;
      }
      .ntray-item:hover {
        background: rgba(255,255,255,0.055);
        border-color: rgba(255,255,255,0.09);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0,0,0,0.3);
      }
      .ntray-item.selected {
        background: rgba(78,205,196,0.08);
        border-color: rgba(78,205,196,0.45);
        box-shadow: 0 0 18px rgba(78,205,196,0.1), inset 0 0 10px rgba(78,205,196,0.04);
      }

      .ntray-item-icon-bg {
        width: 42px;
        height: 42px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), filter 0.2s ease;
      }
      .ntray-item-icon-bg svg { width: 20px; height: 20px; }
      .ntray-item:hover .ntray-item-icon-bg {
        transform: scale(1.08);
        filter: brightness(1.15);
      }
      .ntray-item-label {
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 10px;
        font-weight: 600;
        color: #5a6b80;
        white-space: nowrap;
        letter-spacing: 0.2px;
        transition: color 0.15s;
      }
      .ntray-item:hover .ntray-item-label { color: #c8d6e5; }

      /* ── Config chips (expanded below supernode) ── */
      .ntray-configs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 10px 0 4px;
        animation: ntray-configs-appear 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ntray-config-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 999px;
        cursor: pointer;
        transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 11px;
        font-weight: 500;
        color: #94a3b8;
        white-space: nowrap;
      }
      .ntray-config-chip:hover {
        background: rgba(255,255,255,0.07);
        border-color: rgba(255,255,255,0.14);
        color: #e2e8f0;
        transform: translateY(-1px);
        box-shadow: 0 3px 12px rgba(0,0,0,0.25);
      }
      .ntray-config-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* ── Worker list (Nodelings tab) ── */
      .ntray-worker-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ntray-worker-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        background: rgba(255,255,255,0.025);
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        width: 100%;
        box-sizing: border-box;
      }
      .ntray-worker-row:hover {
        background: rgba(78,205,196,0.04);
        border-color: rgba(78,205,196,0.15);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      }
      .ntray-worker-icon {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        opacity: 0.85;
      }
      .ntray-worker-row:hover .ntray-worker-icon { opacity: 1; }
      .ntray-worker-icon svg { width: 100%; height: 100%; }
      .ntray-worker-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .ntray-worker-name {
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        font-weight: 600;
        color: #e2e8f0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: 0.2px;
      }
      .ntray-worker-status {
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 10px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .ntray-worker-status::before {
        content: '';
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        animation: ntray-status-pulse 2s ease-in-out infinite;
        flex-shrink: 0;
      }
      .ntray-worker-actions {
        display: flex;
        gap: 4px;
        margin-left: auto;
        flex-shrink: 0;
        opacity: 0.5;
        transition: opacity 0.15s;
      }
      .ntray-worker-row:hover .ntray-worker-actions { opacity: 1; }
      .ntray-worker-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: transparent;
        color: #526077;
        cursor: pointer;
        transition: all 0.15s ease;
        padding: 0;
      }
      .ntray-worker-btn:hover {
        background: rgba(255,255,255,0.06);
        color: #e2e8f0;
      }
      .ntray-worker-settings:hover {
        color: #4ecdc4;
        border-color: rgba(78,205,196,0.25);
        background: rgba(78,205,196,0.08);
      }
      .ntray-worker-delete:hover {
        color: #f87171;
        border-color: rgba(248,113,113,0.25);
        background: rgba(248,113,113,0.08);
      }

      /* ── Hire divider ── */
      .ntray-spawn-divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(78,205,196,0.12), transparent);
        margin: 6px 0 10px;
      }

      /* ── Role groups ── */
      .ntray-role-group {
        margin-bottom: 8px;
      }
      .ntray-role-group-name {
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        padding: 6px 2px 6px;
        opacity: 0.7;
      }
      .ntray-roles-grid {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ntray-role-card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.04);
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        width: 100%;
        box-sizing: border-box;
        text-align: left;
      }
      .ntray-role-card:hover {
        background: rgba(255,255,255,0.05);
        border-color: rgba(255,255,255,0.1);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      }
      .ntray-role-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .ntray-role-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }
      .ntray-role-name {
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 12px;
        font-weight: 600;
        color: #c8d6e5;
        letter-spacing: 0.2px;
      }
      .ntray-role-desc {
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 10px;
        color: #526077;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ntray-role-card:hover .ntray-role-name { color: #e2e8f0; }
      .ntray-role-card:hover .ntray-role-desc { color: #94a3b8; }

      /* ── Tab bar ── */
      .ntray-tabs {
        display: flex;
        gap: 2px;
        background: rgba(10,12,20,0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 999px;
        padding: clamp(3px, 0.8vw, 5px);
        box-shadow: 0 4px 28px rgba(0,0,0,0.5), 0 0 20px rgba(78,205,196,0.03);
        max-width: calc(100vw - 16px);
      }
      .ntray-tab {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: clamp(10px, 2vw, 14px);
        background: transparent;
        border: none;
        border-radius: 999px;
        color: #526077;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ntray-tab:hover {
        color: #94a3b8;
        background: rgba(255,255,255,0.05);
      }
      .ntray-tab.active {
        color: #e2e8f0;
        background: rgba(78,205,196,0.1);
      }
      .ntray-tab svg { flex-shrink: 0; transition: transform 0.2s ease; }
      .ntray-tab:hover svg { transform: scale(1.05); }

      .ntray-divider {
        width: 1px;
        height: 22px;
        background: rgba(255,255,255,0.08);
        align-self: center;
        margin: 0 2px;
        flex-shrink: 0;
      }

      .ntray-eraser.active { color: #f87171; background: rgba(248,113,113,0.1); }
      .ntray-eraser:hover { color: #f87171; }
      .ntray-tool[data-tool="move"]:hover  { color: #4ecdc4; }
      .ntray-tool[data-tool="move"].active { color: #4ecdc4; background: rgba(78,205,196,0.1); }
      .ntray-tool[data-tool="path"]:hover  { color: #a78bfa; }
      .ntray-tool[data-tool="path"].active { color: #a78bfa; background: rgba(167,139,250,0.1); }

      /* ── Open state ── */
      .ntray.ntray-open {
        width: min(460px, calc(100vw - 24px));
        background: linear-gradient(180deg, rgba(14,18,30,0.97) 0%, rgba(10,14,24,0.97) 100%);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 20px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.55), 0 0 24px rgba(78,205,196,0.05), inset 0 1px 0 rgba(255,255,255,0.04);
      }
      .ntray.ntray-open .ntray-panel {
        background: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        border: none;
        box-shadow: none;
        border-radius: 0;
        margin-bottom: 0;
        width: 100%;
      }
      .ntray.ntray-open .ntray-tabs {
        background: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        border: none;
        box-shadow: none;
        border-radius: 0;
        width: 100%;
        max-width: 100%;
        justify-content: center;
        border-top: 1px solid rgba(255,255,255,0.05);
      }

      /* ── Tooltip ── */
      .ntray-tooltip {
        position: fixed;
        transform: translate(-50%, -100%);
        background: rgba(10,14,24,0.97);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 6px 12px;
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 11px;
        color: #94a3b8;
        white-space: nowrap;
        pointer-events: none;
        z-index: 9999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }

      /* ── Mobile ── */
      @media (max-width: 600px) {
        .ntray {
          left: 0; right: 0;
          transform: none;
          max-width: 100%;
          padding: 0 8px;
          box-sizing: border-box;
          bottom: 8px;
        }
        .ntray-tabs { width: 100%; max-width: 100%; border-radius: 999px; }
        .ntray-tab { padding: 14px; }
        .ntray-panel { width: 100%; padding: 0 0 6px; border-radius: 20px 20px 0 0; }
        .ntray-item { min-width: 56px; padding: 8px 5px 5px; }
        .ntray.ntray-open { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }
}
