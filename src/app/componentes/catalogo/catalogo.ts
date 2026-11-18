import { Subscription } from 'rxjs';
import { Component, DestroyRef, OnInit, signal, inject, HostListener } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AvisosService } from '../../servicios/avisos';
import { CatalogoService } from '../../servicios/catalogo';
import { AuthService } from '../../servicios/auth';
import { ComprasService } from '../../servicios/compras';
import { WishlistService } from '../../servicios/wishlist';
import { CarritoService } from '../../servicios/carrito';
import { ImagenesProductoService } from '../../servicios/imagenes-producto';
import { FiltroProducto, ProductoResponse, TipoCompatibilidad } from '../../modelos/catalogo';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './catalogo.html',
  styleUrl: './catalogo.css',
})
export class Catalogo implements OnInit {
  private catalogoService = inject(CatalogoService);
  public authService = inject(AuthService);
  public wishlistService = inject(WishlistService);
  public carritoService = inject(CarritoService);
  public imagenesService = inject(ImagenesProductoService);
  private comprasService = inject(ComprasService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private avisos = inject(AvisosService);
  private formBuilder = inject(FormBuilder).nonNullable;

  private destroyRef = inject(DestroyRef);
  private solicitudProductos?: Subscription;
  private filtrosAplicados: FiltroProducto & { texto?: string } = {};

  // Productos de la página activa que se muestran en la cuadrícula
  productos = signal<ProductoResponse[]>([]);
  cargando = signal<boolean>(false);
  mensaje = signal<string | null>(null);
  error = signal<string | null>(null);

  // Categoría seleccionada
  categoriaActiva = signal<string>('TODOS');

  // Paginación
  pagina = signal<number>(0);
  tamano = signal<number>(9);
  totalPaginas = signal<number>(0);
  totalElementos = signal<number>(0);
  readonly tamanosDisponibles = [9, 18, 27];

  // Filtros
  busquedaTexto = '';
  filtroMarca = '';
  filtroColor = '';
  precioMin: number | null = null;
  precioMax: number | null = null;
  compatibilidadTipo: '' | TipoCompatibilidad = '';
  compatibilidadModelo = '';

  // Lista completa de marcas (se auto-complementa con la BD)
  marcasDisponibles: string[] = [
    'AGV', 'Alpinestars', 'Bell', 'Cardo', 'Cyclone', 'Dainese', 'FreedConn',
    'Givi', 'HJC', 'Kappa', 'LS2', 'Motowolf', 'Quad Lock', 'RAM Mounts',
    'Rainwear', 'Revit', 'Sena', 'Shad', 'Shark', 'Shoei'
  ];

  coloresDisponibles: string[] = [
    'Negro', 'Blanco', 'Azul', 'Rojo', 'Gris', 'Titanio', 'Verde', 'Amarillo', 'Plata', 'Carbono'
  ];

  // Estado de los selectores desplegables con scrollbar
  dropdownMarcasAbierto = signal<boolean>(false);
  dropdownColoresAbierto = signal<boolean>(false);

  @HostListener('document:click')
  onDocumentClick(): void {
    this.cerrarDropdowns();
  }

  toggleDropdownMarcas(event?: Event): void {
    if (event) event.stopPropagation();
    this.dropdownMarcasAbierto.update((v) => !v);
    this.dropdownColoresAbierto.set(false);
  }

  toggleDropdownColores(event?: Event): void {
    if (event) event.stopPropagation();
    this.dropdownColoresAbierto.update((v) => !v);
    this.dropdownMarcasAbierto.set(false);
  }

  cerrarDropdowns(): void {
    this.dropdownMarcasAbierto.set(false);
    this.dropdownColoresAbierto.set(false);
  }

  obtenerMuestraColor(color: string): string {
    const c = (color || '').toLowerCase();
    if (c.includes('negro')) return '#111827';
    if (c.includes('blanco')) return '#ffffff';
    if (c.includes('rojo')) return '#e31837';
    if (c.includes('azul')) return '#1d4ed8';
    if (c.includes('gris') || c.includes('asfalto')) return '#6b7280';
    if (c.includes('titanio') || c.includes('nardo')) return '#475569';
    if (c.includes('carbon')) return '#18181b';
    if (c.includes('verde') || c.includes('oliva')) return '#15803d';
    if (c.includes('amarillo') || c.includes('fluor') || c.includes('neon')) return '#eab308';
    if (c.includes('plata') || c.includes('metal')) return '#cbd5e1';
    if (c.includes('marron') || c.includes('arena')) return '#78350f';
    if (c.includes('transparente')) return '#f8fafc';
    return '#9ca3af';
  }

  ngOnInit(): void {
    this.actualizarCamposProducto();
    if (this.route.snapshot.data['abrirFormularioProducto'] && this.authService.esAdmin()) {
      this.abrirModalCrear();
    }

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.limpiarFiltrosInternos();
      const categoria = params.get('categoria')?.toUpperCase();
      const tipo = params.get('tipo')?.toUpperCase();
      this.categoriaActiva.set(
        categoria || (tipo?.includes('CASCO') ? 'CASCOS' : tipo) || (params.has('outlet') ? 'OUTLET' : 'TODOS')
      );
      this.busquedaTexto = params.get('q') ?? '';
      this.filtroMarca = params.get('marca') ?? '';
      this.filtroColor = params.get('color') ?? '';
      this.aplicarFiltros();
    });
  }

  cambiarCategoria(categoria: string): void {
    this.limpiarFiltrosInternos();
    this.categoriaActiva.set(categoria);

    const destino = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: categoria === 'TODOS' ? {} : { categoria: categoria.toLowerCase() },
    });
    if (this.router.serializeUrl(destino) === this.router.url) {
      this.aplicarFiltros();
    } else {
      void this.router.navigateByUrl(destino);
    }
  }

  cargarProductos(numPagina: number = 0): void {
    this.solicitudProductos?.unsubscribe();
    this.cargando.set(true);
    this.error.set(null);

    const { texto, precioMinimo, precioMaximo, ...filtros } = this.filtrosAplicados;
    const paginacion = { pagina: numPagina, tamano: this.tamano() };
    const precios = { precioMinimo, precioMaximo, moneda: 'COP' };
    const solicitud = texto
      ? this.catalogoService.buscarPorTexto({ texto, ...precios, ...paginacion })
      : this.catalogoService.listar({ ...filtros, ...precios, ...paginacion });

    this.solicitudProductos = solicitud.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ content, totalElements, totalPages, number }) => {
        if (totalPages > 0 && number >= totalPages) {
          this.cargarProductos(totalPages - 1);
          return;
        }

        this.productos.set(content);
        this.totalElementos.set(totalElements);
        this.totalPaginas.set(totalPages);
        this.pagina.set(totalPages ? number : 0);
        this.actualizarMarcasYColores(content);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set('No se pudo conectar con el catálogo: ' + (err.error?.mensaje || err.message));
        this.cargando.set(false);
      },
    });
  }

  private actualizarMarcasYColores(items: ProductoResponse[]): void {
    const marcas = new Set(this.marcasDisponibles);
    const colores = new Set(this.coloresDisponibles);
    for (const producto of items) {
      const marca = producto.marca?.trim();
      const color = producto.color?.trim();
      if (marca) marcas.add(marca);
      if (color) colores.add(color);
    }

    this.marcasDisponibles = [...marcas].sort();
    this.coloresDisponibles = [...colores].sort();
  }

  cambiarPagina(num: number): void {
    if (num < 0 || num >= this.totalPaginas() || num === this.pagina()) return;
    this.cargarProductos(num);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 380, behavior: 'smooth' });
    }
  }

  cambiarTamano(nuevoTamano: number): void {
    this.tamano.set(nuevoTamano);
    this.cargarProductos(0);
  }

  paginasVisibles(): number[] {
    const total = this.totalPaginas();
    const actual = this.pagina();
    const res: number[] = [];

    let inicio = Math.max(0, actual - 2);
    let fin = Math.min(total - 1, inicio + 4);

    if (fin - inicio < 4) {
      inicio = Math.max(0, fin - 4);
    }

    for (let i = inicio; i <= fin; i++) {
      res.push(i);
    }
    return res;
  }

  seleccionarMarca(marca: string): void {
    this.filtroMarca = this.filtroMarca === marca ? '' : marca;
    this.aplicarFiltros();
  }

  seleccionarColor(color: string): void {
    this.filtroColor = this.filtroColor === color ? '' : color;
    this.aplicarFiltros();
  }

  aplicarFiltros(): void {
    this.cerrarDropdowns();
    const modelo = this.compatibilidadModelo.trim();
    const compatibilidadCompleta = this.compatibilidadTipo && modelo;
    const maximo = this.precioMax ?? undefined;
    this.filtrosAplicados = {
      texto: this.busquedaTexto.trim(),
      marca: this.filtroMarca || undefined,
      color: this.filtroColor || undefined,
      precioMinimo: this.precioMin ?? undefined,
      precioMaximo: this.categoriaActiva() === 'OUTLET' ? Math.min(maximo ?? 300000, 300000) : maximo,
      tipoCompatibilidad: compatibilidadCompleta ? this.compatibilidadTipo || undefined : undefined,
      modeloCompatibilidad: compatibilidadCompleta ? modelo : undefined,
    };
    this.cargarProductos(0);
  }

  limpiarFiltros(): void {
    this.cambiarCategoria('TODOS');
  }

  private limpiarFiltrosInternos(): void {
    this.busquedaTexto = '';
    this.filtroMarca = '';
    this.filtroColor = '';
    this.precioMin = null;
    this.precioMax = null;
    this.compatibilidadTipo = '';
    this.compatibilidadModelo = '';
    this.cerrarDropdowns();
  }

  comprar(producto: ProductoResponse): void {
    this.carritoService.agregar(producto, 1);
  }

  togglePublicacion(producto: ProductoResponse): void {
    if (producto.estadoPublicacion === 'PUBLICADO') {
      this.catalogoService.despublicar(producto.id).subscribe({
        next: () => {
          this.mensaje.set(`Producto "${producto.marca} ${producto.tipo}" despublicado (oculto para clientes).`);
          this.cargarProductos(this.pagina());
          setTimeout(() => this.mensaje.set(null), 4000);
        },
        error: (err) => this.error.set('Error al despublicar: ' + (err.error?.mensaje || err.message)),
      });
    } else {
      this.catalogoService.publicar(producto.id).subscribe({
        next: () => {
          this.mensaje.set(`Producto "${producto.marca} ${producto.tipo}" vuelto a poner disponible en la tienda.`);
          this.cargarProductos(this.pagina());
          setTimeout(() => this.mensaje.set(null), 4000);
        },
        error: (err) => this.error.set('Error al publicar: ' + (err.error?.mensaje || err.message)),
      });
    }
  }

  eliminar(producto: ProductoResponse): void {
    if (!confirm(`¿Eliminar definitivamente el producto "${producto.marca} ${producto.tipo}"?`)) return;
    this.cargando.set(true);
    this.catalogoService.eliminar(producto.id).subscribe({
      next: () => {
        this.wishlistService.eliminar(producto.id);
        this.mensaje.set(`Producto "${producto.marca} ${producto.tipo}" eliminado del catálogo.`);
        this.cargarProductos(this.pagina());
        setTimeout(() => this.mensaje.set(null), 4000);
      },
      error: (err) => {
        this.cargando.set(false);
        this.error.set('Error al eliminar producto: ' + (err.error?.mensaje || err.message));
      },
    });
  }
}