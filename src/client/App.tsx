import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { api, ApiError, onUnauthorized } from './lib/api';
import { ToastProvider } from './components/Toast';
import { Login, SetupNeeded } from './routes/Login';
import { Layout } from './routes/Layout';
import { Pack } from './routes/Pack';
import { Trips } from './routes/Trips';
import { NewTrip } from './routes/NewTrip';
import { TripSettings } from './routes/TripSettings';
import { Catalog, ItemEditor } from './routes/Catalog';
import { Templates, TemplateEditor } from './routes/Templates';
import { People } from './routes/People';
import { Suitcases } from './routes/Suitcases';
import { More } from './routes/More';
import { Settings } from './routes/Settings';
import { ConnectAI } from './routes/ConnectAI';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && [401, 403, 404, 503].includes(e.status)) && n < 2,
      refetchOnWindowFocus: true,
    },
  },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Pack /> },
      { path: '/trips', element: <Trips /> },
      { path: '/trips/new', element: <NewTrip /> },
      { path: '/trips/:id', element: <TripSettings /> },
      { path: '/catalog', element: <Catalog /> },
      { path: '/catalog/:id', element: <ItemEditor /> },
      { path: '/more', element: <More /> },
      { path: '/templates', element: <Templates /> },
      { path: '/templates/:id', element: <TemplateEditor /> },
      { path: '/people', element: <People /> },
      { path: '/suitcases', element: <Suitcases /> },
      { path: '/settings', element: <Settings /> },
      { path: '/connect', element: <ConnectAI /> },
      { path: '*', element: <Pack /> },
    ],
  },
]);

function Gate() {
  const qc = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<{ ok: true; instance_name: string }>('/session'),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  useEffect(
    () =>
      onUnauthorized(() => {
        qc.setQueryData(['session'], null);
        qc.invalidateQueries({ queryKey: ['session'] });
      }),
    [qc],
  );
  if (session.isPending) return <div className="h-full bg-bg" />;
  const err = session.error;
  if (err instanceof ApiError && err.status === 503) return <SetupNeeded message={err.message} />;
  if (err instanceof ApiError && err.status === 0) {
    // Offline before we could confirm the session: show the app and let cached data fill in.
    return <RouterProvider router={router} />;
  }
  if (err || !session.data) return <Login />;
  return <RouterProvider router={router} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </QueryClientProvider>
  );
}
