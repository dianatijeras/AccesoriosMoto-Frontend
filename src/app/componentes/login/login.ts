import { Component, DestroyRef, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../servicios/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  public authService = inject(AuthService);
  private router = inject(Router);
  private formBuilder = inject(FormBuilder).nonNullable;

  esModoRegistro = signal<boolean>(false);
  cargando = signal<boolean>(false);
  error = signal<string | null>(null);
  mensaje = signal<string | null>(null);

  readonly loginForm: FormGroup<{
    correo: FormControl<string>;
    contrasena: FormControl<string>;
  }> = this.formBuilder.group({
    correo: ['', [Validators.required, Validators.email]],
    contrasena: ['', Validators.required],
  });

  readonly registroForm = this.formBuilder.group({
    nombre: '',
    correo: '',
    contrasena: '',
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.authService.avisoSesionVencida.set(null));
  }

  cambiarModo(registro: boolean): void {
    this.esModoRegistro.set(registro);
    this.error.set(null);
    this.mensaje.set(null);
  }

  iniciarSesion(): void {
    if (this.cargando()) return;

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.error.set(null);
    this.authService.avisoSesionVencida.set(null);

    this.authService
      .login(this.loginForm.getRawValue())
      .subscribe({
        next: () => {
          this.cargando.set(false);
          this.mensaje.set('¡Inicio de sesión exitoso!');
          setTimeout(() => {
            this.router.navigate(['/catalogo']);
          }, 1000);
        },
        error: (err) => {
          this.cargando.set(false);
          this.error.set(
            err.status === 401
              ? 'Correo o contraseña incorrectos.'
              : err.error?.error ||
                  err.error?.message ||
                  'No se pudo iniciar sesión. Verifica tu conexión e inténtalo de nuevo.'
          );
        },
      });
  }

  registrar(): void {
    const { nombre, correo, contrasena } = this.registroForm.getRawValue();

    if (!nombre || !correo || !contrasena) {
      this.error.set('Por favor completa todos los campos.');
      return;
    }

    if (contrasena.length < 8) {
      this.error.set('La contraseña debe tener mínimo 8 caracteres.');
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    this.authService
      .registro({ nombre, correo, contrasena })
      .subscribe({
        next: (usuario) => {
          const nombreMostrado = usuario?.nombre || nombre || 'comprador';
          this.mensaje.set(
            `¡Usuario "${nombreMostrado}" registrado con éxito! Iniciando sesión automáticamente...`
          );
          // Inicio de sesión automático y persistencia inmediata en localStorage
          this.authService
            .login({ correo, contrasena })
            .subscribe({
              next: () => {
                this.cargando.set(false);
                setTimeout(() => {
                  this.router.navigate(['/catalogo']);
                }, 1000);
              },
              error: () => {
                this.cargando.set(false);
                this.loginForm.setValue({ correo, contrasena });
                this.esModoRegistro.set(false);
              },
            });
        },
        error: (err) => {
          this.cargando.set(false);
          this.error.set(
            err.error?.mensaje ||
              err.error?.message ||
              'Error al registrar el comprador. Verifica que el correo no esté ya registrado.'
          );
        },
      });
  }

  cerrarSesion(): void {
    this.authService.logout();
    this.mensaje.set('Sesión finalizada.');
  }
}