export class HelpUI {
  constructor() {
    this.modal = document.getElementById('help-modal');
    this.openBtn = document.getElementById('help-btn');
    this.closeBtn = document.getElementById('close-help-btn');
    this.init();
  }

  init() {
    if (!this.modal) return;
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