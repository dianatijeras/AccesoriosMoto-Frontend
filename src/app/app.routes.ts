import { Routes } from '@angular/router';
import { Inicio } from './componentes/inicio/inicio';
import { Catalogo } from './componentes/catalogo/catalogo';
import { Login } from './componentes/login/login';
import { authGuard } from './guards/auth.guard';
import { loginGuard } from './guards/login.guard';

export const routes: Routes = [
  { path: '', component: Inicio },
  { path: 'inicio', component: Inicio },
  {
    path: 'catalogo/nuevo',
    component: Catalogo,
    canActivate: [authGuard],
    data: { abrirFormularioProducto: true },
  },
  { path: 'catalogo', component: Catalogo },
  { path: 'login', component: Login, canActivate: [loginGuard] },
  { path: '**', redirectTo: '' },
];
