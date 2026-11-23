export class HelpUI {
  constructor() {
    this.modal = document.getElementById('help-modal');
    this.openBtn = document.getElementById('help-btn');
    this.closeBtn = document.getElementById('close-help-btn');
    this.initialized = false;
  }

  init() {
    if (!this.modal || this.initialized) return;
    this.initialized = true;
    this.bindEvents();
  }

  bindEvents() {
    this.openBtn?.addEventListener('click', () => this.openModal());
    this.closeBtn?.addEventListener('click', () => this.closeModal());
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeModal();
      });
    }
  }

  openModal() {
    if (this.modal) {
      this.modal.classList.remove('hidden');
    }
  }

  closeModal() {
    if (this.modal) {
      this.modal.classList.add('hidden');
    }
  }
}

export const helpUI = new HelpUI();