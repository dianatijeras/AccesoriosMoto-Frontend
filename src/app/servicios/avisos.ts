import { Injectable, signal } from '@angular/core';

export interface Aviso {
  readonly tipo: 'exito' | 'error' | 'info';
  readonly mensaje: string;
}

@Injectable({ providedIn: 'root' })
export class AvisosService {
  private readonly estado = signal<readonly Aviso[]>([]);
  readonly avisos = this.estado.asReadonly();

  exito(mensaje: string): void {
    this.mostrar('exito', mensaje);
  }

  error(mensaje: string): void {
    this.mostrar('error', mensaje);
  }

  info(mensaje: string): void {
    this.mostrar('info', mensaje);
  }

  cerrar(aviso: Aviso): void {
    this.estado.update((avisos) => avisos.filter((actual) => actual !== aviso));
  }

  private mostrar(tipo: Aviso['tipo'], mensaje: string): void {
    if (this.avisos().some((aviso) => aviso.tipo === tipo && aviso.mensaje === mensaje)) return;

    const aviso: Aviso = { tipo, mensaje };
    this.estado.update((avisos) => [...avisos, aviso]);
    setTimeout(() => this.cerrar(aviso), 5000);
  }
}
