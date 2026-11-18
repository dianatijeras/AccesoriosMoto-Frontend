import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../servicios/auth';
import { AvisosService } from '../servicios/avisos';
import { catchError, throwError } from 'rxjs';

const mensajeSesionVencida = 'Tu sesión venció. Inicia sesión nuevamente.';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const ruta = req.url.split(/[?#]/, 1)[0];
  if (/\/api\/auth\/(login|registro)\/?$/.test(ruta)) {
    return next(req);
  }

  const authService = inject(AuthService);
  const avisos = inject(AvisosService);
  const router = inject(Router);
  const token = authService.getToken();
  const sesion = authService.sesion();
  const consultaPublica = req.method === 'GET' && /\/api\/productos(?:\/|$)/.test(ruta);
  const solicitud = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(solicitud).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) {
        return throwError(() => error);
      }

      const sesionActual = authService.sesion();
      if (consultaPublica) {
        if (!token) return throwError(() => error);
        if (sesionActual === sesion) authService.logout();
        return next(req.clone({ headers: req.headers.delete('Authorization') }));
      }

      if (
        sesionActual
          ? sesionActual === sesion
          : !avisos.avisos().some((aviso) => aviso.mensaje === mensajeSesionVencida)
      ) {
        authService.logout();
        avisos.error(mensajeSesionVencida);
        void router.navigate(['/login'], { replaceUrl: true });
      }
      return throwError(() => error);
    })
  );
};
