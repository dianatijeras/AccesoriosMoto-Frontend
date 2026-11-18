import { Component, inject } from '@angular/core';
import { AvisosService } from '../../servicios/avisos';

@Component({
  selector: 'app-aviso',
  standalone: true,
  template: `
    @for (aviso of servicio.avisos(); track aviso) {
      <div
        class="aviso"
        [class.exito]="aviso.tipo === 'exito'"
        [class.error]="aviso.tipo === 'error'"
        [attr.role]="aviso.tipo === 'error' ? 'alert' : 'status'"
      >
        <span>{{ aviso.mensaje }}</span>
        <button type="button" (click)="servicio.cerrar(aviso)">Cerrar</button>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 1rem 1rem auto auto;
      width: min(24rem, calc(100% - 2rem));
      z-index: 10000;
    }

    .aviso {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.5rem;
      padding: 0.75rem 1rem;
      border-radius: 4px;
      border-left: 3px solid #3b82f6;
      background: #eff6ff;
      color: #1e40af;
      box-shadow: 0 2px 8px #0002;
      font-size: 0.875rem;
    }

    .exito {
      border-color: #10b981;
      background: #ecfdf5;
      color: #065f46;
    }

    .error {
      border-color: #ef4444;
      background: #fef2f2;
      color: #991b1b;
    }

    button {
      border: 0;
      padding: 0.25rem;
      background: transparent;
      color: inherit;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
  `,
})
export class AvisoComponent {
  protected readonly servicio = inject(AvisosService);
}
