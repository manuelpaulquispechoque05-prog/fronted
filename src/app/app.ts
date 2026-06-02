import { Component, signal, inject, OnInit, OnDestroy, computed, NgZone, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReporteService, Reporte, Comentario } from './services/reporte.service';
import { AuthService } from './services/auth.service';
import { SocketService } from './services/socket.service';
import { PushService } from './services/push.service';
import { AdminUsuariosComponent } from './admin-usuarios/admin-usuarios.component';
import { MonitoreoSocketsComponent } from './monitoreo-sockets/monitoreo-sockets.component';

interface Translations {
  [key: string]: {
    dashboard: string;
    reportes: string;
    configuracion: string;
    nuevoReporte: string;
    panelControl: string;
    pendientes: string;
    enReparacion: string;
    solucionados: string;
    listaReportes: string;
    buscar: string;
    acciones: string;
    idioma: string;
    darkMode: string;
    notificaciones: string;
    crearReporte: string;
    cancelar: string;
    titulo: string;
    ubicacion: string;
    descripcion: string;
    noReportes: string;
    cargando: string;
    admin: string;
    studySync: string;
    infraestructura: string;
    version: string;
    idiomaLabel: string;
    notificacionesLabel: string;
    infoSistema: string;
    editarReporte: string;
    estado: string;
    guardarCambios: string;
    iniciarSesion: string;
    registrarse: string;
    cerrarSesion: string;
    perfil: string;
    email: string;
    contrasena: string;
    nombre: string;
    actualizar: string;
    adminPanel: string;
    buscarUsuarios: string;
    sinUsuarios: string;
    reportadoPor: string;
    authError: string;
    adminOnly: string;
    crearUsuario: string;
    editarUsuario: string;
    rol: string;
    guardar: string;
    eliminar: string;
    confirmarEliminar: string;
    sinPassword: string;
  };
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, AdminUsuariosComponent, MonitoreoSocketsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private reporteService = inject(ReporteService);
  private authService = inject(AuthService);
  private socketService = inject(SocketService);
  private pushService = inject(PushService);
  private ngZone = inject(NgZone);
  private destroyRef = inject(DestroyRef);

  reportes = signal<Reporte[]>([]);

  titulo = signal('');
  descripcion = signal('');
  ubicacion = signal('');

  cargando = signal(false);
  mensaje = signal('');
  mensajeAlerta = signal<string | null>(null);

  moduloActivo = signal<'dashboard' | 'reportes' | 'configuracion' | 'admin-usuarios' | 'monitoreo-sockets'>('dashboard');
  mostrarModal = signal(false);
  sidebarOpen = signal(false);

  reporteSeleccionado = signal<Reporte | null>(null);
  estadoSeleccionado = signal<string>('Pendiente');

  comentarios = signal<Comentario[]>([]);
  nuevoComentarioTexto = signal('');
  comentariosCargando = signal(false);
  reporteComentariosActivo = signal<Reporte | null>(null);

  darkMode = signal(true);
  idioma = signal<'es' | 'en' | 'pt'>('es');
  notificaciones = signal(false);

  busqueda = signal('');

  // Auth
  authFormType = signal<'login' | 'register'>('login');
  loginEmail = signal('');
  loginPassword = signal('');
  registerNombre = signal('');
  registerEmail = signal('');
  registerPassword = signal('');
  authLoading = signal(false);
  authError = signal('');

  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly usuario = this.authService.usuario;
  readonly isAdmin = this.authService.isAdmin;

  // Perfil
  perfilNombre = signal('');
  perfilEmail = signal('');
  perfilLoading = signal(false);
  perfilMensaje = signal('');

  private translations: Translations = {
    es: {
      dashboard: 'Panel de Control',
      reportes: 'Reportes',
      configuracion: 'Configuración',
      nuevoReporte: 'Nuevo Reporte',
      panelControl: 'Panel de Control',
      pendientes: 'Pendientes',
      enReparacion: 'En Reparación',
      solucionados: 'Solucionados',
      listaReportes: 'Lista de Reportes',
      buscar: 'Buscar por título o ubicación...',
      acciones: 'Acciones',
      idioma: 'Idioma',
      darkMode: 'Modo Oscuro',
      notificaciones: 'Notificaciones',
      crearReporte: 'Crear Reporte',
      cancelar: 'Cancelar',
      titulo: 'Título',
      ubicacion: 'Ubicación',
      descripcion: 'Descripción',
      noReportes: 'No hay reportes registrados',
      cargando: 'Cargando...',
      admin: 'Administrador',
      studySync: 'StudySync',
      infraestructura: 'Infraestructura',
      version: 'Versión',
      idiomaLabel: 'Selecciona el idioma de la aplicación',
      notificacionesLabel: 'Recibe alertas sobre nuevos reportes',
      infoSistema: 'Información del Sistema',
      editarReporte: 'Editar Reporte',
      estado: 'Estado',
      guardarCambios: 'Guardar Cambios',
      iniciarSesion: 'Iniciar Sesión',
      registrarse: 'Registrarse',
      cerrarSesion: 'Cerrar Sesión',
      perfil: 'Perfil',
      email: 'Correo Electrónico',
      contrasena: 'Contraseña',
      nombre: 'Nombre Completo',
      actualizar: 'Actualizar',
      adminPanel: 'Panel de Administración',
      buscarUsuarios: 'Buscar usuarios por nombre o email...',
      sinUsuarios: 'No se encontraron usuarios',
      reportadoPor: 'Reportado por',
      authError: 'Error de autenticación',
      adminOnly: 'Solo administradores',
      crearUsuario: 'Crear Usuario',
      editarUsuario: 'Editar Usuario',
      rol: 'Rol',
      guardar: 'Guardar',
      eliminar: 'Eliminar',
      confirmarEliminar: '¿Estás seguro de eliminar este usuario? Los reportes que creó quedarán sin dueño.',
      sinPassword: 'Dejar vacío para mantener la actual'
    },
    en: {
      dashboard: 'Dashboard',
      reportes: 'Reports',
      configuracion: 'Settings',
      nuevoReporte: 'New Report',
      panelControl: 'Control Panel',
      pendientes: 'Pending',
      enReparacion: 'In Repair',
      solucionados: 'Solved',
      listaReportes: 'Reports List',
      buscar: 'Search by title or location...',
      acciones: 'Actions',
      idioma: 'Language',
      darkMode: 'Dark Mode',
      notificaciones: 'Notifications',
      crearReporte: 'Create Report',
      cancelar: 'Cancel',
      titulo: 'Title',
      ubicacion: 'Location',
      descripcion: 'Description',
      noReportes: 'No reports registered',
      cargando: 'Loading...',
      admin: 'Administrator',
      studySync: 'StudySync',
      infraestructura: 'Infrastructure',
      version: 'Version',
      idiomaLabel: 'Select application language',
      notificacionesLabel: 'Receive alerts about new reports',
      infoSistema: 'System Information',
      editarReporte: 'Edit Report',
      estado: 'State',
      guardarCambios: 'Save Changes',
      iniciarSesion: 'Sign In',
      registrarse: 'Sign Up',
      cerrarSesion: 'Sign Out',
      perfil: 'Profile',
      email: 'Email',
      contrasena: 'Password',
      nombre: 'Full Name',
      actualizar: 'Update',
      adminPanel: 'Admin Panel',
      buscarUsuarios: 'Search users by name or email...',
      sinUsuarios: 'No users found',
      reportadoPor: 'Reported by',
      authError: 'Authentication error',
      adminOnly: 'Administrators only',
      crearUsuario: 'Create User',
      editarUsuario: 'Edit User',
      rol: 'Role',
      guardar: 'Save',
      eliminar: 'Delete',
      confirmarEliminar: 'Are you sure you want to delete this user? Their reports will become ownerless.',
      sinPassword: 'Leave empty to keep current'
    },
    pt: {
      dashboard: 'Painel',
      reportes: 'Relatórios',
      configuracion: 'Configurações',
      nuevoReporte: 'Novo Relatório',
      panelControl: 'Painel de Controle',
      pendientes: 'Pendentes',
      enReparacion: 'Em Reparo',
      solucionados: 'Solucionados',
      listaReportes: 'Lista de Relatórios',
      buscar: 'Buscar por título ou localização...',
      acciones: 'Ações',
      idioma: 'Idioma',
      darkMode: 'Modo Escuro',
      notificaciones: 'Notificações',
      crearReporte: 'Criar Relatório',
      cancelar: 'Cancelar',
      titulo: 'Título',
      ubicacion: 'Localização',
      descripcion: 'Descrição',
      noReportes: 'Nenhum relatório registrado',
      cargando: 'Carregando...',
      admin: 'Administrador',
      studySync: 'StudySync',
      infraestructura: 'Infraestrutura',
      version: 'Versão',
      idiomaLabel: 'Selecione o idioma do aplicativo',
      notificacionesLabel: 'Receba alertas sobre novos relatórios',
      infoSistema: 'Informações do Sistema',
      editarReporte: 'Editar Relatório',
      estado: 'Estado',
      guardarCambios: 'Salvar Alterações',
      iniciarSesion: 'Entrar',
      registrarse: 'Cadastrar',
      cerrarSesion: 'Sair',
      perfil: 'Perfil',
      email: 'E-mail',
      contrasena: 'Senha',
      nombre: 'Nome Completo',
      actualizar: 'Atualizar',
      adminPanel: 'Painel de Administração',
      buscarUsuarios: 'Buscar usuários por nome ou e-mail...',
      sinUsuarios: 'Nenhum usuário encontrado',
      reportadoPor: 'Reportado por',
      authError: 'Erro de autenticação',
      adminOnly: 'Apenas administradores',
      crearUsuario: 'Criar Usuário',
      editarUsuario: 'Editar Usuário',
      rol: 'Função',
      guardar: 'Salvar',
      eliminar: 'Excluir',
      confirmarEliminar: 'Tem certeza que deseja excluir este usuário? Os relatórios dele ficarão sem dono.',
      sinPassword: 'Deixe vazio para manter a atual'
    }
  };

  t = (key: keyof Translations['es']): string => {
    return this.translations[this.idioma()][key] || key;
  }

  get pendientes(): number {
    return this.reportes().filter(r => r.estado === 'Pendiente').length;
  }

  get enReparacion(): number {
    return this.reportes().filter(r => r.estado === 'En Reparación').length;
  }

  get solucionados(): number {
    return this.reportes().filter(r => r.estado === 'Solucionado').length;
  }

  reportesFiltrados = computed(() => {
    const search = this.busqueda().toLowerCase().trim();
    if (!search) return this.reportes();
    return this.reportes().filter(r =>
      r.titulo.toLowerCase().includes(search) ||
      r.ubicacion.toLowerCase().includes(search)
    );
  });

  tituloModulo = computed(() => {
    const mod = this.moduloActivo();
    switch (mod) {
      case 'dashboard': return this.t('dashboard');
      case 'reportes': return this.t('reportes');
      case 'configuracion': return this.t('configuracion');
      case 'admin-usuarios': return '👑 Gestión de Usuarios';
      case 'monitoreo-sockets': return '🖥️ Monitoreo Sockets';
      default: return '';
    }
  });

  private STORAGE_KEY_COMENTARIO = 'reporteComentarioActivoId';

  ngOnInit() {
    this.pushService.init();
    if (this.isAuthenticated()) {
      this.cargarReportes();
      this.conectarSocket();
      this.iniciarPerfil();
    }
  }

  private iniciarPerfil() {
    const u = this.usuario();
    if (u) {
      this.perfilNombre.set(u.nombre);
      this.perfilEmail.set(u.email);
    }
  }

  private conectarSocket() {
    if (!this.isAuthenticated()) return;
    const socket = this.socketService.connect();

    socket.on('reporte.creado', (data: any) => {
      this.ngZone.run(() => this.reportes.update((lista) => [data, ...lista]));
    });

    socket.on('reporte.actualizado', (data: any) => {
      this.ngZone.run(() =>
        this.reportes.update((lista) =>
          lista.map((r) => (r.id === data.id ? { ...r, ...data } : r))
        )
      );
    });

    socket.on('reporte.eliminado', (data: any) => {
      this.ngZone.run(() =>
        this.reportes.update((lista) =>
          lista.filter((r) => r.id !== data.id)
        )
      );
    });

    this.destroyRef.onDestroy(() => this.socketService.disconnect());
  }

  ngOnDestroy() {
  }

  login() {
    const email = this.loginEmail().trim();
    const password = this.loginPassword().trim();

    if (!email || !password) {
      this.authError.set('Email y contraseña son obligatorios');
      return;
    }

    this.authLoading.set(true);
    this.authError.set('');

    this.authService.login({ email, password }).subscribe({
      next: () => {
        this.authLoading.set(false);
        this.cargarReportes();
        this.conectarSocket();
        this.iniciarPerfil();
      },
      error: (err) => {
        this.authLoading.set(false);
        this.authError.set(err.error?.error || 'Error al iniciar sesión');
      }
    });
  }

  register() {
    const nombre = this.registerNombre().trim();
    const email = this.registerEmail().trim();
    const password = this.registerPassword().trim();

    if (!nombre || !email || !password) {
      this.authError.set('Todos los campos son obligatorios');
      return;
    }

    this.authLoading.set(true);
    this.authError.set('');

    this.authService.register({ nombre, email, password }).subscribe({
      next: () => {
        this.authLoading.set(false);
        this.cargarReportes();
        this.conectarSocket();
        this.iniciarPerfil();
      },
      error: (err) => {
        this.authLoading.set(false);
        this.authError.set(err.error?.error || 'Error al registrarse');
      }
    });
  }

  logout() {
    this.authService.logoutBackend().subscribe({ error: () => {} });
    this.socketService.disconnect();
    this.authService.logout();
    this.reportes.set([]);
    this.moduloActivo.set('dashboard');
  }

  updatePerfil() {
    const data: any = {};
    if (this.perfilNombre().trim()) data.nombre = this.perfilNombre().trim();
    if (this.perfilEmail().trim()) data.email = this.perfilEmail().trim();

    this.perfilLoading.set(true);
    this.perfilMensaje.set('');

    this.authService.updatePerfil(data).subscribe({
      next: () => {
        this.perfilLoading.set(false);
        this.perfilMensaje.set('✅ Perfil actualizado');
        setTimeout(() => this.perfilMensaje.set(''), 3000);
      },
      error: (err) => {
        this.perfilLoading.set(false);
        this.perfilMensaje.set('❌ ' + (err.error?.error || 'Error al actualizar'));
        setTimeout(() => this.perfilMensaje.set(''), 3000);
      }
    });
  }

  cambiarAuthForm(tipo: 'login' | 'register') {
    this.authFormType.set(tipo);
    this.authError.set('');
  }

  cargarReportes() {
    this.cargando.set(true);
    this.reporteService.getAll().subscribe({
      next: (data) => {
        this.reportes.set(data);
        this.cargando.set(false);
        this.restaurarComentarios();
      },
      error: (err) => {
        console.error('Error al cargar:', err);
        this.manejarErrorHttp(err, 'cargar reportes');
        this.cargando.set(false);
      }
    });
  }

  private restaurarComentarios() {
    const id = localStorage.getItem(this.STORAGE_KEY_COMENTARIO);
    if (!id) return;
    const reporte = this.reportes().find(r => r.id === id);
    if (reporte) {
      this.abrirComentarios(reporte);
    } else {
      localStorage.removeItem(this.STORAGE_KEY_COMENTARIO);
    }
  }

  crearReporte() {
    const tituloVal = this.titulo().trim();
    const ubicacionVal = this.ubicacion().trim();

    if (!tituloVal || !ubicacionVal) {
      this.mensaje.set('⚠️ Título y Ubicación son obligatorios');
      return;
    }

    this.reporteService.create({
      titulo: tituloVal,
      descripcion: this.descripcion(),
      ubicacion: ubicacionVal
    }).subscribe({
      next: () => {
        this.mensaje.set('✅ Reporte creado exitosamente');
        this.titulo.set('');
        this.descripcion.set('');
        this.ubicacion.set('');
        this.cerrarModal();
        this.cargarReportes();
        setTimeout(() => this.mensaje.set(''), 3000);
      },
      error: (err) => {
        this.manejarErrorHttp(err, 'crear reporte');
        console.error(err);
      }
    });
  }

  cambiarEstado(reporte: Reporte, nuevoEstado: string) {
    this.reporteService.cambiarEstado(reporte.id, nuevoEstado).subscribe({
      next: () => {
        this.mensaje.set('✅ Estado actualizado');
        this.cargarReportes();
        setTimeout(() => this.mensaje.set(''), 2000);
      },
      error: (err) => {
        this.manejarErrorHttp(err, 'actualizar estado');
        console.error(err);
      }
    });
  }

  eliminarReporte(id: string) {
    if (!confirm('¿Estás seguro de eliminar este reporte?')) return;

    this.reporteService.delete(id).subscribe({
      next: () => {
        this.mensaje.set('✅ Reporte eliminado');
        this.cargarReportes();
        setTimeout(() => this.mensaje.set(''), 2000);
      },
      error: (err) => {
        this.manejarErrorHttp(err, 'eliminar reporte');
        console.error(err);
      }
    });
  }

  abrirComentarios(reporte: Reporte) {
    localStorage.setItem(this.STORAGE_KEY_COMENTARIO, reporte.id);
    this.reporteComentariosActivo.set(reporte);
    this.comentariosCargando.set(true);
    this.reporteService.getComentarios(reporte.id).subscribe({
      next: (data) => { this.comentarios.set(data); this.comentariosCargando.set(false); },
      error: () => { this.comentariosCargando.set(false); }
    });
  }

  cerrarComentarios() {
    localStorage.removeItem(this.STORAGE_KEY_COMENTARIO);
    this.reporteComentariosActivo.set(null);
    this.comentarios.set([]);
    this.nuevoComentarioTexto.set('');
  }

  enviarComentario() {
    const texto = this.nuevoComentarioTexto().trim();
    const reporte = this.reporteComentariosActivo();
    if (!texto || !reporte) return;

    this.reporteService.crearComentario(reporte.id, texto).subscribe({
      next: () => {
        this.nuevoComentarioTexto.set('');
        this.abrirComentarios(reporte);
      },
      error: (err) => this.manejarErrorHttp(err, 'enviar comentario')
    });
  }

  private manejarErrorHttp(err: any, contexto: string): void {
    if (err.status === 429) {
      const msg = err.error?.mensaje || '¡Alerta de Autoataque! Demasiadas peticiones. Inténtalo más tarde.';
      this.mensajeAlerta.set(msg);
      setTimeout(() => this.mensajeAlerta.set(null), 4000);
    } else {
      this.mensaje.set(`❌ Error al ${contexto}`);
    }
  }

  getBadgeClass(estado: string): string {
    switch (estado) {
      case 'Pendiente': return 'badge-pendiente';
      case 'En Reparación': return 'badge-reparacion';
      case 'Solucionado': return 'badge-solucionado';
      default: return '';
    }
  }

  getProximoEstado(estado: string): string {
    switch (estado) {
      case 'Pendiente': return 'En Reparación';
      case 'En Reparación': return 'Solucionado';
      default: return 'Pendiente';
    }
  }

  cambiarModulo(modulo: 'dashboard' | 'reportes' | 'configuracion' | 'admin-usuarios' | 'monitoreo-sockets') {
    this.moduloActivo.set(modulo);
    this.sidebarOpen.set(false);
    if (modulo !== 'reportes') {
      this.cerrarComentarios();
    }
    if (modulo === 'configuracion') {
      this.iniciarPerfil();
    }
  }

  abrirModal() {
    this.mostrarModal.set(true);
  }

  cerrarModal() {
    this.mostrarModal.set(false);
    this.titulo.set('');
    this.descripcion.set('');
    this.ubicacion.set('');
    this.reporteSeleccionado.set(null);
    this.estadoSeleccionado.set('Pendiente');
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  toggleDarkMode() {
    this.darkMode.update(v => !v);
  }

  async toggleNotificaciones() {
    const activar = !this.notificaciones();
    this.notificaciones.set(activar);
    if (activar) {
      const ok = await this.pushService.suscribir();
      if (!ok) this.notificaciones.set(false);
    } else {
      this.pushService.desuscribir();
    }
  }

  cambiarIdioma(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.idioma.set(select.value as 'es' | 'en' | 'pt');
  }

  abrirModalEdicion(reporte: Reporte) {
    this.reporteSeleccionado.set(reporte);
    this.estadoSeleccionado.set(reporte.estado);
    this.titulo.set(reporte.titulo);
    this.ubicacion.set(reporte.ubicacion);
    this.descripcion.set(reporte.descripcion || '');
    this.mostrarModal.set(true);
  }

  guardarCambiosReporte() {
    const id = this.reporteSeleccionado()?.id;
    if (!id) return;

    const nuevoEstado = this.estadoSeleccionado() as 'Pendiente' | 'En Reparación' | 'Solucionado';

    this.reporteService.update(id, {
      titulo: this.titulo(),
      descripcion: this.descripcion(),
      ubicacion: this.ubicacion(),
      estado: nuevoEstado
    }).subscribe({
      next: () => {
        this.mensaje.set('✅ Reporte actualizado correctamente');
        this.cerrarModal();
        this.cargarReportes();
        setTimeout(() => this.mensaje.set(''), 3000);
      },
      error: (err) => {
        this.manejarErrorHttp(err, 'actualizar reporte');
        console.error(err);
      }
    });
  }
}
