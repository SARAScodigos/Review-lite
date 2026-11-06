import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ApiError {
  detail?: string;
}

export const LoginView = () => {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('sistema');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to="/projects" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(username.trim(), password);
      const previousPath = (
        location.state as { from?: { pathname?: string } } | null
      )?.from?.pathname;
      navigate(previousPath || '/projects', { replace: true });
    } catch (requestError: unknown) {
      if (axios.isAxiosError<ApiError>(requestError)) {
        setError(
          requestError.response?.data?.detail
            ?? 'No fue posible iniciar sesión. Verifica la conexión con el servidor.',
        );
      } else {
        setError('Ocurrió un error inesperado al iniciar sesión.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#075ba5] px-4 py-10"
      style={{ backgroundImage: "url('/branding/fondo-login.svg')", backgroundRepeat: 'repeat', backgroundSize: '88px 74px' }}
    >
      <section className="w-full max-w-sm rounded-2xl border border-white/70 bg-white p-5 shadow-xl sm:p-6">
        <div className="mb-5 text-center">
          <img
            src="/branding/LOGO.png"
            alt="A-Review"
            className="mx-auto mb-4 h-auto max-h-16 w-44 max-w-full object-contain"
          />
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Iniciar sesión</h1>
          <p className="mt-1 text-xs text-slate-500">Accede a tu espacio de trabajo.</p>
        </div>

        {searchParams.get('expired') === '1' && !error && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Tu sesión expiró. Vuelve a ingresar para continuar.
          </div>
        )}

        {error && (
          <div role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </div>
        )}

        <form className="space-y-3.5" onSubmit={handleSubmit} aria-busy={isSubmitting}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700">Usuario</span>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
                autoFocus
                className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                placeholder="Nombre de usuario"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700">Contraseña</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                placeholder="Ingresa tu contraseña"
              />
              <button
                type="button"
                onClick={() => setShowPassword((currentValue) => !currentValue)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition duration-150 hover:bg-emerald-700 active:scale-[0.99] motion-reduce:transform-none focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Ingresar
              </>
            )}
          </button>
        </form>
      </section>
    </main>
  );
};
