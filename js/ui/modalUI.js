// File: js/ui/modalUI.js
export class ModalUI {
  constructor() {
    this.isInitialized = true;
    this.activeToast = null;
    this.toastTimeout = null;
  }
  
  init() {}
  
  _buildDialog(title, textHTML, inputHTML, buttonsHTML, onInit) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'gt-modal-overlay';
      
      const dialog = document.createElement('div');
      dialog.className = 'gt-modal-box';
      
      const titleEl = document.createElement('div');
      titleEl.className = 'gt-modal-title';
      titleEl.textContent = title;
      dialog.appendChild(titleEl);
      
      if (textHTML) {
        const textEl = document.createElement('div');
        textEl.className = 'gt-modal-text';
        textEl.innerHTML = textHTML;
        dialog.appendChild(textEl);
      }
      
      if (inputHTML) {
        const inputWrapper = document.createElement('div');
        inputWrapper.innerHTML = inputHTML;
        while (inputWrapper.firstChild) {
          dialog.appendChild(inputWrapper.firstChild);
        }
      }
      
      const actions = document.createElement('div');
      actions.className = 'gt-modal-actions';
      actions.innerHTML = buttonsHTML;
      dialog.appendChild(actions);
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      requestAnimationFrame(() => {
        overlay.classList.add('show');
      });
      
      const close = (value) => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 200);
        resolve(value);
      };
      
      onInit(dialog, close);
    });
  }
  
  showAlert(title, message) {
    const btnHTML = `<button class="gt-btn-confirm">OK</button>`;
    return this._buildDialog(title, message, null, btnHTML, (dialog, close) => {
      dialog.querySelector('.gt-btn-confirm').onclick = () => close();
    });
  }
  
  showConfirm(title, message) {
    const btnHTML = `
        <button class="gt-btn-cancel">CANCEL</button>
        <button class="gt-btn-danger">CONFIRM</button>
    `;
    return this._buildDialog(title, message, null, btnHTML, (dialog, close) => {
      dialog.querySelector('.gt-btn-cancel').onclick = () => close(false);
      dialog.querySelector('.gt-btn-danger').onclick = () => close(true);
    });
  }
  
  // รองรับ inputType โดยค่าเริ่มต้นเป็น 'text' แก้ปัญหาพิมพ์ได้แต่ตัวเลข
  showPrompt(title, placeholder, defaultValue = '', inputType = 'text') {
    const inputHTML = `<input type="${inputType}" class="gt-modal-input" placeholder="${placeholder}" value="${defaultValue}">`;
    const btnHTML = `
        <button class="gt-btn-cancel">CANCEL</button>
        <button class="gt-btn-confirm">OK</button>
    `;
    return this._buildDialog(title, null, inputHTML, btnHTML, (dialog, close) => {
      const input = dialog.querySelector('.gt-modal-input');
      dialog.querySelector('.gt-btn-cancel').onclick = () => close(null);
      dialog.querySelector('.gt-btn-confirm').onclick = () => close(input.value);
      setTimeout(() => {
        input.focus();
        if (input.type === 'text') {
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 100);
    });
  }
  
  showDoublePrompt(title, placeholder1, value1, placeholder2, value2) {
    const inputHTML = `
        <input type="text" id="gt-input-1" class="gt-modal-input" placeholder="${placeholder1}" value="${value1}" style="margin-bottom: 12px;">
        <input type="number" id="gt-input-2" class="gt-modal-input" placeholder="${placeholder2}" value="${value2}">
    `;
    const btnHTML = `
        <button class="gt-btn-cancel">CANCEL</button>
        <button class="gt-btn-confirm">OK</button>
    `;
    return this._buildDialog(title, null, inputHTML, btnHTML, (dialog, close) => {
      const input1 = dialog.querySelector('#gt-input-1');
      const input2 = dialog.querySelector('#gt-input-2');
      dialog.querySelector('.gt-btn-cancel').onclick = () => close(null);
      dialog.querySelector('.gt-btn-confirm').onclick = () => {
        close({ val1: input1.value, val2: input2.value });
      };
      
      setTimeout(() => {
        input1.focus();
        input1.setSelectionRange(input1.value.length, input1.value.length);
      }, 100);
    });
  }
  
  showToast(message, type = 'success') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    
    const createToast = () => {
      toastContainer.innerHTML = '';
      const toast = document.createElement('div');
      const isError = type === 'error';
      const isInfo = type === 'info';
      const isWarning = type === 'warning';
      
      const bgColor = isError ? 'rgba(255, 42, 42, 0.2)' : isInfo ? 'rgba(0, 229, 255, 0.18)' : isWarning ? 'rgba(255, 200, 0, 0.2)' : 'rgba(26, 26, 36, 0.9)';
      const borderColor = isError ? 'rgba(255, 42, 42, 0.5)' : isInfo ? 'rgba(0, 229, 255, 0.4)' : isWarning ? 'rgba(255, 200, 0, 0.5)' : 'rgba(0, 229, 255, 0.3)';
      const textColor = isError ? '#ff7878' : isInfo ? '#6bedff' : isWarning ? '#ffe57f' : '#00e5ff';
      const shadowColor = isError ? 'rgba(255, 42, 42, 0.3)' : 'rgba(0, 0, 0, 0.6)';
      
      // Toast ขนาดกะทัดรัด ไม่ชนขอบจอมือถือ
      toast.style.cssText = `
          color: ${textColor};
          background: ${bgColor};
          border: 1px solid ${borderColor};
          padding: 10px 18px;
          border-radius: 20px;
          box-shadow: 0 8px 24px ${shadowColor};
          transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
          text-align: center;
          font-weight: 600;
          font-size: 13px;
          line-height: 1.4;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          transform: translateY(-15px) scale(0.95);
          opacity: 0;
          white-space: normal;
          max-width: min(85vw, 340px);
          word-break: break-word;
          box-sizing: border-box;
          pointer-events: none;
      `;
      
      toast.textContent = message;
      toastContainer.appendChild(toast);
      this.activeToast = toast;
      
      requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0) scale(1)';
        toast.style.opacity = '1';
      });
      
      this.toastTimeout = setTimeout(() => {
        this._hideToast(toast);
      }, 1600);
    };
    
    if (this.activeToast) {
      clearTimeout(this.toastTimeout);
      this.activeToast.style.opacity = '0';
      this.activeToast.style.transform = 'translateY(-10px) scale(0.95)';
      this.activeToast = null;
      setTimeout(() => createToast(), 150);
    } else {
      createToast();
    }
  }
  
  _hideToast(toast) {
    if (!toast) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px) scale(0.95)';
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
      if (this.activeToast === toast) this.activeToast = null;
    }, 200);
  }
}

export const modalUI = new ModalUI();
