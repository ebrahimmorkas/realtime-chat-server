import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/AuthLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ChatLayout, NoConversationSelected } from '@/features/chat/ChatLayout';
import { ConversationView } from '@/features/chat/ConversationView';

const router = createBrowserRouter([
  { index: true, element: <Navigate to="/chat" replace /> },
  {
    path: 'login',
    element: (
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: 'register',
    element: (
      <RedirectIfAuthed>
        <RegisterPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: 'chat',
    element: (
      <RequireAuth>
        <ChatLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <NoConversationSelected /> },
      { path: ':conversationId', element: <ConversationView /> },
    ],
  },
  { path: '*', element: <Navigate to="/chat" replace /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
