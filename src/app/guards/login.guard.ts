import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../servicios/auth';

export const loginGuard: CanActivateFn = () => {
  if (inject(AuthService).getToken()) {
    return inject(Router).createUrlTree(['/catalogo']);
  }

  return true;
};
