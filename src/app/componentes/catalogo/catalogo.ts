import { finalize, Subscription } from 'rxjs';
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

  readonly compatibilidadActiva = signal<{ producto: ProductoResponse; tipo: TipoCompatibilidad } | null>(null);
  readonly guardandoCompatibilidad = signal(false);
  readonly modeloCompatible = this.formBuilder.control('', [Validators.required, Validators.pattern(/\S/)]);

  abrirCompatibilidad(producto: ProductoResponse): void {
    if (!this.authService.esAdmin() || producto.estadoPublicacion === 'ELIMINADO') return;
    const tipos: Partial<Record<string, TipoCompatibilidad>> = { Baul: 'MOTO', Visor: 'CASCO' };
    const tipo = tipos[producto.tipo];
    if (!tipo) return;

    this.modeloCompatible.reset('');
    this.compatibilidadActiva.set({ producto, tipo });
  }

  cerrarCompatibilidad(): void {
    if (!this.guardandoCompatibilidad()) this.compatibilidadActiva.set(null);
  }

  gestionarCompatibilidad(retirar = false): void {
    const seleccion = this.compatibilidadActiva();
    if (!seleccion || !this.authService.esAdmin() || this.guardandoCompatibilidad() || this.modeloCompatible.invalid) return;

    const { producto, tipo } = seleccion;
    const modelo = this.modeloCompatible.value.trim();
    const solicitud = retirar
      ? this.catalogoService.retirarCompatibilidad(producto.id, tipo, modelo)
      : this.catalogoService.indicarCompatibilidad(producto.id, tipo, modelo);

    this.guardandoCompatibilidad.set(true);
    solicitud.pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.guardandoCompatibilidad.set(false)),
    ).subscribe({
      next: () => this.avisos.exito(retirar ? 'Compatibilidad retirada.' : 'Compatibilidad registrada.'),
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) return;
        const mensaje = err.error?.mensaje;
        this.avisos.error(typeof mensaje === 'string' && mensaje
          ? mensaje
          : 'No se pudo guardar el cambio de compatibilidad.');
      },
    });
  }

  /**
   * Obtiene la imagen adecuada (Backend -> Imagen personalizada -> Preset -> Fallback)
   */
  obtenerImagen(prod: ProductoResponse): string {
    return this.imagenesService.obtenerImagen(prod);
  }

  toggleWishlist(prod: ProductoResponse, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.wishlistService.toggle(prod);
  }

  onImgError(event: Event, prod: ProductoResponse): void {
    const target = event.target as HTMLImageElement;
    if (!target) return;
    const tipo = (prod.tipo || '').toLowerCase();
    if (tipo.includes('casco')) {
      target.src = '/productos/casco-agv-k3-negro.jpg';
    } else if (tipo.includes('chaqueta')) {
      target.src = '/productos/chaqueta-alpinestars-cuero.jpg';
    } else if (tipo.includes('guante')) {
      target.src = '/productos/guantes-dainese-negro.jpg';
    } else if (tipo.includes('baul')) {
      target.src = '/productos/baul-givi-negro.jpg';
    } else if (tipo.includes('intercom')) {
      target.src = '/productos/intercomunicador-cardo-gris.jpg';
    } else if (tipo.includes('soporte')) {
      target.src = '/productos/soporte-quadlock-negro.jpg';
    } else if (tipo.includes('visor')) {
      target.src = '/productos/visor-agv-transparente.jpg';
    } else {
      target.src = '/productos/impermeable-rainwear-azul.jpg';
    }
  }

  obtenerBadge(prod: ProductoResponse): string {
    const t = prod.tipo?.toLowerCase() || '';
    if (t.includes('casco')) {
      if (prod.precioMonto >= 2000000) return 'FIM / ECE 22.06';
      if (prod.precioMonto >= 800000) return 'ECE 22.06';
      return 'ECE 22.05';
    }
    if (t.includes('chaqueta')) {
      if (prod.precioMonto >= 2000000) return 'CUERO PRO NIVEL 5';
      if (prod.precioMonto >= 1000000) return 'NIVEL 3 CE';
      return 'TEXTIL PROTECCIÓN';
    }
    if (t.includes('guante')) {
      if (prod.precioMonto >= 600000) return 'KEVLAR RACING';
      return 'NUDILLOS CE';
    }
    if (t.includes('baul')) {
      if (prod.precioMonto >= 1500000) return 'ALUMINIO 58L';
      return 'MONOKEY SYSTEM';
    }
    if (t.includes('impermeable')) {
      return '100% TERMOSELLADO';
    }
    if (t.includes('intercom')) {
      if (prod.precioMonto >= 1000000) return 'DYNAMIC MESH 2.0';
      return 'BLUETOOTH 5.0';
    }
    if (t.includes('soporte')) {
      return 'ANTI-VIBRACIÓN';
    }
    if (t.includes('visor')) {
      if (prod.color?.toLowerCase().includes('iridium')) return 'IRIDIUM ANTI-RAYAS';
      return 'PINLOCK READY';
    }
    if (prod.precioMonto <= 300000) return 'OUTLET DEAL';
    return 'ORIGINAL';
  }

  // --- MODAL DE CREACIÓN DE PRODUCTOS (SOLO ADMINISTRADOR) ---
  modalCrearAbierto = signal<boolean>(false);
  guardandoProducto = signal<boolean>(false);

  // Opciones válidas para Enums requeridos por el Backend de Spring Boot
  readonly tallasDisponibles = ['XS', 'S', 'M', 'L', 'XL'];

  readonly nivelesProteccion = [
    { valor: 'NIVEL_1', label: 'Nivel 1 - Básico Urbano' },
    { valor: 'NIVEL_2', label: 'Nivel 2 - Protección Ciudad CE' },
    { valor: 'NIVEL_3', label: 'Nivel 3 - Deportivo / Carretera' },
    { valor: 'NIVEL_4', label: 'Nivel 4 - Alto Impacto Touring' },
    { valor: 'NIVEL_5', label: 'Nivel 5 - Máxima Competición Racing' },
  ];

  readonly materiales = [
    { valor: 'POLICARBONATO', label: 'Policarbonato de alta resistencia' },
    { valor: 'ABS', label: 'Termoplástico ABS' },
    { valor: 'FIBRA_DE_VIDRIO', label: 'Fibra de Vidrio' },
    { valor: 'FIBRA_DE_CARBONO', label: 'Fibra de Carbono' },
    { valor: 'KEVLAR', label: 'Kevlar' },
    { valor: 'CUERO', label: 'Cuero Genuino' },
    { valor: 'CUERO_SINTETICO', label: 'Cuero Sintético' },
    { valor: 'TEXTIL', label: 'Textil Cordura' },
    { valor: 'NYLON', label: 'Nylon de Alta Densidad' },
    { valor: 'POLIESTER', label: 'Poliéster' },
    { valor: 'ALUMINIO', label: 'Aluminio Reforzado' },
    { valor: 'PLASTICO', label: 'Plástico Inyectado' },
    { valor: 'PVC', label: 'PVC Impermeable' },
    { valor: 'ACERO', label: 'Acero Inoxidable' },
  ];

  private readonly textoObligatorio = [Validators.required, Validators.pattern(/\S/)];
  readonly productoForm = this.formBuilder.group({
    tipo: ['Casco', Validators.required],
    marcaNombre: ['AGV', this.textoObligatorio],
    color: ['Negro', this.textoObligatorio],
    precioMonto: [650000, [Validators.required, Validators.min(1000)]],
    modelo: ['K3 SV Racing', this.textoObligatorio],
    talla: ['M', Validators.required],
    material: ['POLICARBONATO', Validators.required],
    proteccion: ['NIVEL_3', Validators.required],
    certificacionSeguridad: ['ECE 22.06', this.textoObligatorio],
    capacidadLitros: [45, [Validators.required, Validators.min(1)]],
    dimensiones: ['40x35x30 cm', this.textoObligatorio],
    capacidadMaximaCarga: [10, [Validators.required, Validators.min(1)]],
    alcanceMetros: [1200, [Validators.required, Validators.min(10)]],
    autonomiaHoras: [13, [Validators.required, Validators.min(1)]],
    bluetooth: [true, Validators.required],
    tipoSujecion: ['Manubrio', this.textoObligatorio],
    tipoVisor: ['Transparente Antirrayas Pinlock Ready', this.textoObligatorio],
  });

  private readonly camposPorTipo: Record<string, (keyof typeof this.productoForm.controls)[]> = {
    Casco: ['modelo', 'talla', 'proteccion', 'certificacionSeguridad'],
    Chaqueta: ['material', 'talla', 'proteccion'],
    Guantes: ['material', 'talla', 'proteccion'],
    Impermeable: ['material', 'talla'],
    Baul: ['material', 'capacidadLitros', 'dimensiones', 'capacidadMaximaCarga'],
    Intercomunicador: ['alcanceMetros', 'autonomiaHoras', 'bluetooth'],
    SoporteCelular: ['tipoSujecion'],
    Visor: ['tipoVisor'],
  };

  nuevoProducto = {
    // Configuración de imagen (solo Galería y Descargas)
    modoImagen: 'preset' as 'preset' | 'descargados',
    imagenUrl: '/productos/casco-scorpion-exo.jpg',
    previewImagen: '/productos/casco-scorpion-exo.jpg',
  };

  abrirModalCrear(): void {
    this.modalCrearAbierto.set(true);
  }

  cerrarModalCrear(): void {
    this.modalCrearAbierto.set(false);
  }

  onTipoProductoChange(): void {
    const tipo = this.productoForm.controls.tipo.value;
    if (tipo === 'Casco') {
      this.productoForm.patchValue({ talla: 'M', proteccion: 'NIVEL_3', material: 'POLICARBONATO', certificacionSeguridad: 'ECE 22.06' });
      this.seleccionarPreset('/productos/casco-agv-k3-negro.jpg');
    } else if (tipo === 'Chaqueta') {
      this.productoForm.patchValue({ talla: 'L', proteccion: 'NIVEL_2', material: 'CUERO' });
      this.seleccionarPreset('/productos/chaqueta-alpinestars-cuero.jpg');
    } else if (tipo === 'Guantes') {
      this.productoForm.patchValue({ talla: 'M', proteccion: 'NIVEL_2', material: 'CUERO' });
      this.seleccionarPreset('/productos/guantes-dainese-negro.jpg');
    } else if (tipo === 'Impermeable') {
      this.productoForm.patchValue({ talla: 'L', material: 'PVC' });
      this.seleccionarPreset('/productos/impermeable-rainwear-azul.jpg');
    } else if (tipo === 'Baul') {
      this.productoForm.patchValue({ material: 'ALUMINIO', capacidadLitros: 45, capacidadMaximaCarga: 10, dimensiones: '45x40x32 cm' });
      this.seleccionarPreset('/productos/baul-givi-negro.jpg');
    } else if (tipo === 'Intercomunicador') {
      this.productoForm.patchValue({ alcanceMetros: 1200, autonomiaHoras: 13, bluetooth: true });
      this.seleccionarPreset('/productos/intercomunicador-cardo-gris.jpg');
    } else if (tipo === 'SoporteCelular') {
      this.productoForm.patchValue({ tipoSujecion: 'Manubrio' });
      this.seleccionarPreset('/productos/soporte-quadlock-negro.jpg');
    } else if (tipo === 'Visor') {
      this.productoForm.patchValue({ tipoVisor: 'Transparente Antirrayas Pinlock Ready' });
      this.seleccionarPreset('/productos/visor-agv-transparente.jpg');
    }
    this.actualizarCamposProducto();
  }

  private actualizarCamposProducto(): void {
    const { controls } = this.productoForm;
    const camposActivos = this.camposPorTipo[controls.tipo.value] ?? [];
    for (const campo of Object.keys(controls) as (keyof typeof controls)[]) {
      if (campo === 'tipo' || campo === 'marcaNombre' || campo === 'color' || campo === 'precioMonto') continue;
      if (camposActivos.includes(campo)) {
        controls[campo].enable({ emitEvent: false });
      } else {
        controls[campo].disable({ emitEvent: false });
      }
    }
  }

  seleccionarPreset(url: string): void {
    this.nuevoProducto.imagenUrl = url;
    this.nuevoProducto.previewImagen = url;
  }

  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const fileNameLower = file.name.toLowerCase();

      // Detección directa de rutas locales estáticas de alta velocidad (0ms de lag):
      if (fileNameLower.includes('scorpion')) {
        this.nuevoProducto.imagenUrl = '/productos/casco-scorpion-exo.jpg';
        this.nuevoProducto.previewImagen = '/productos/casco-scorpion-exo.jpg';
      } else if (fileNameLower.includes('agv') || fileNameLower.includes('k3')) {
        this.nuevoProducto.imagenUrl = '/productos/casco-agv-k3-negro.jpg';
        this.nuevoProducto.previewImagen = '/productos/casco-agv-k3-negro.jpg';
      } else if (fileNameLower.includes('ls2')) {
        this.nuevoProducto.imagenUrl = '/productos/casco-ls2-blanco.jpg';
        this.nuevoProducto.previewImagen = '/productos/casco-ls2-blanco.jpg';
      } else if (fileNameLower.includes('alpinestar') || fileNameLower.includes('chaqueta')) {
        this.nuevoProducto.imagenUrl = '/productos/chaqueta-alpinestars-cuero.jpg';
        this.nuevoProducto.previewImagen = '/productos/chaqueta-alpinestars-cuero.jpg';
      } else if (fileNameLower.includes('guante') || fileNameLower.includes('dainese')) {
        this.nuevoProducto.imagenUrl = '/productos/guantes-dainese-negro.jpg';
        this.nuevoProducto.previewImagen = '/productos/guantes-dainese-negro.jpg';
      } else if (fileNameLower.includes('impermeable')) {
        this.nuevoProducto.imagenUrl = '/productos/impermeable-rainwear-azul.jpg';
        this.nuevoProducto.previewImagen = '/productos/impermeable-rainwear-azul.jpg';
      } else if (fileNameLower.includes('cardo') || fileNameLower.includes('intercom')) {
        this.nuevoProducto.imagenUrl = '/productos/intercomunicador-cardo-gris.jpg';
        this.nuevoProducto.previewImagen = '/productos/intercomunicador-cardo-gris.jpg';
      } else if (fileNameLower.includes('baul') || fileNameLower.includes('givi')) {
        this.nuevoProducto.imagenUrl = '/productos/baul-givi-negro.jpg';
        this.nuevoProducto.previewImagen = '/productos/baul-givi-negro.jpg';
      } else if (fileNameLower.includes('soporte') || fileNameLower.includes('quad')) {
        this.nuevoProducto.imagenUrl = '/productos/soporte-quadlock-negro.jpg';
        this.nuevoProducto.previewImagen = '/productos/soporte-quadlock-negro.jpg';
      } else if (fileNameLower.includes('visor')) {
        this.nuevoProducto.imagenUrl = '/productos/visor-agv-transparente.jpg';
        this.nuevoProducto.previewImagen = '/productos/visor-agv-transparente.jpg';
      } else {
        const rutaEstatica = this.obtenerPresetPorTipo(this.productoForm.controls.tipo.value);
        this.nuevoProducto.imagenUrl = rutaEstatica;
        this.nuevoProducto.previewImagen = URL.createObjectURL(file);
      }
    }
  }

  obtenerPresetPorTipo(tipo: string): string {
    const t = (tipo || '').toLowerCase();
    if (t.includes('casco')) return '/productos/casco-scorpion-exo.jpg';
    if (t.includes('chaqueta')) return '/productos/chaqueta-alpinestars-cuero.jpg';
    if (t.includes('guante')) return '/productos/guantes-dainese-negro.jpg';
    if (t.includes('impermeable')) return '/productos/impermeable-rainwear-azul.jpg';
    if (t.includes('baul')) return '/productos/baul-givi-negro.jpg';
    if (t.includes('intercom')) return '/productos/intercomunicador-cardo-gris.jpg';
    if (t.includes('soporte')) return '/productos/soporte-quadlock-negro.jpg';
    if (t.includes('visor')) return '/productos/visor-agv-transparente.jpg';
    return '/productos/casco-scorpion-exo.jpg';
  }

  guardarNuevoProducto(): void {
    if (this.guardandoProducto() || !this.authService.esAdmin()) return;
    if (this.productoForm.invalid) {
      this.productoForm.markAllAsTouched();
      this.avisos.error('Revisa los datos ingresados.');
      return;
    }

    const p = { ...this.productoForm.getRawValue(), ...this.nuevoProducto };
    const marcaId = 'marca-' + p.marcaNombre.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const precioMoneda = 'COP';
    const imagenFinal = p.imagenUrl || p.previewImagen || this.obtenerPresetPorTipo(p.tipo);

    // Ruta de catálogo segura y de alta velocidad:
    const imagenParaBackend =
      imagenFinal.startsWith('data:') || imagenFinal.length > 500
        ? this.obtenerPresetPorTipo(p.tipo)
        : imagenFinal;

    let obs;
    if (p.tipo === 'Casco') {
      obs = this.catalogoService.crearCasco({
        marcaId,
        marcaNombre: p.marcaNombre.trim(),
        modelo: p.modelo.trim(),
        color: p.color.trim(),
        talla: p.talla,
        precioMonto: Number(p.precioMonto),
        precioMoneda,
        proteccion: p.proteccion,
        certificacionSeguridad: p.certificacionSeguridad.trim() || 'ECE 22.06',
        imagenUrl: imagenParaBackend,
      });
    } else if (p.tipo === 'Chaqueta') {
      obs = this.catalogoService.crearChaqueta({
        marcaId,
        marcaNombre: p.marcaNombre.trim(),
        precioMonto: Number(p.precioMonto),
        precioMoneda,
        color: p.color.trim(),
        talla: p.talla,
        material: p.material,
        proteccion: p.proteccion,
        imagenUrl: imagenParaBackend,
      });
    } else if (p.tipo === 'Guantes') {
      obs = this.catalogoService.crearGuantes({
        marcaId,
        marcaNombre: p.marcaNombre.trim(),
        precioMonto: Number(p.precioMonto),
        precioMoneda,
        color: p.color.trim(),
        talla: p.talla,
        material: p.material,
        proteccion: p.proteccion,
        imagenUrl: imagenParaBackend,
      });
    } else if (p.tipo === 'Impermeable') {
      obs = this.catalogoService.crearImpermeable({
        marcaId,
        marcaNombre: p.marcaNombre.trim(),
        precioMonto: Number(p.precioMonto),
        precioMoneda,
        color: p.color.trim(),
        talla: p.talla,
        material: p.material,
        imagenUrl: imagenParaBackend,
      });
    } else if (p.tipo === 'Baul') {
      obs = this.catalogoService.crearBaul({
        marcaId,
        marcaNombre: p.marcaNombre.trim(),
        material: p.material,
        capacidadLitros: Number(p.capacidadLitros),
        dimensiones: p.dimensiones.trim() || '40x35x30 cm',
        precioMonto: Number(p.precioMonto),
        precioMoneda,
        capacidadMaximaCarga: Number(p.capacidadMaximaCarga),
        color: p.color.trim(),
        imagenUrl: imagenParaBackend,
      });
    } else if (p.tipo === 'Intercomunicador') {
      obs = this.catalogoService.crearIntercomunicador({
        marcaId,
        marcaNombre: p.marcaNombre.trim(),
        precioMonto: Number(p.precioMonto),
        precioMoneda,
        color: p.color.trim(),
        alcanceMetros: Math.round(Number(p.alcanceMetros)),
        autonomiaHoras: Math.round(Number(p.autonomiaHoras)),
        bluetooth: Boolean(p.bluetooth),
        imagenUrl: imagenParaBackend,
      });
    } else if (p.tipo === 'SoporteCelular') {
      obs = this.catalogoService.crearSoporteCelular({
        marcaId,
        marcaNombre: p.marcaNombre.trim(),
        precioMonto: Number(p.precioMonto),
        precioMoneda,
        color: p.color.trim(),
        tipoSujecion: p.tipoSujecion.trim() || 'Manubrio',
        imagenUrl: imagenParaBackend,
      });
    } else if (p.tipo === 'Visor') {
      obs = this.catalogoService.crearVisor({
        marcaId,
        marcaNombre: p.marcaNombre.trim(),
        precioMonto: Number(p.precioMonto),
        precioMoneda,
        color: p.color.trim(),
        tipoVisor: p.tipoVisor.trim() || 'Transparente',
        modelosCascoCompatibles: ['AGV K3', 'AGV K1', 'LS2 Stream'],
        imagenUrl: imagenParaBackend,
      });
    }

    if (!obs) return;
    this.guardandoProducto.set(true);

    obs.subscribe({
      next: (creado) => {
        // Guardamos la imagen localmente
        const imagenGuardada = this.nuevoProducto.imagenUrl || imagenFinal;
        this.imagenesService.guardarImagen(creado.id, imagenGuardada);

        // PUBLICACIÓN AUTOMÁTICA INMEDIATA:
        // Los productos en el backend nacen en estado NO_PUBLICADO. Al publicar inmediatamente,
        // el producto pasa a PUBLICADO y aparece de inmediato en el catálogo como DISPONIBLE.
        this.catalogoService.publicar(creado.id).subscribe({
          next: () => {
            this.guardandoProducto.set(false);
            this.cerrarModalCrear();
            this.avisos.exito('Producto creado correctamente.');
            this.cargarProductos(0);
          },
          error: () => {
            this.guardandoProducto.set(false);
            this.cerrarModalCrear();
            this.avisos.info('Producto creado. No se pudo publicar automáticamente.');
            this.cargarProductos(0);
          },
        });
      },
      error: (err: HttpErrorResponse) => {
        this.guardandoProducto.set(false);
        const mensajes: Record<number, string> = {
          400: 'Revisa los datos ingresados.',
          401: 'Tu sesión no es válida. Inicia sesión nuevamente.',
          403: 'No tienes permisos para realizar esta operación.',
          404: 'No se encontró el recurso solicitado.',
        };
        this.avisos.error(mensajes[err.status] ?? 'No se pudo crear el producto. Inténtalo nuevamente.');
      },
    });
  }
}
