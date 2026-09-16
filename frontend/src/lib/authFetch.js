// Wraps the global fetch() once, at app startup, so every existing
// fetch(...) call across the app automatically:
//   1. gets an `Authorization: Bearer <token>` header attached, and
//   2. gets bounced to /login if the server says the session is invalid/expired.
//
// This avoids having to hand-edit every individual fetch call across the
// codebase to add auth headers. Import this file once, before rendering
// the app (see main.jsx).

const originalFetch = window.fetch.bind(window);

window.fetch = (input, init = {}) => {
  const token = localStorage.getItem('authToken');

  // Merge headers without clobbering any headers the caller already set.
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return originalFetch(input, { ...init, headers }).then((res) => {
    if (res.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      // Avoid an infinite reload loop if the login screen itself
      // ever calls a protected endpoint.
      if (!window.location.pathname.toLowerCase().includes('login')) {
        window.location.reload();
      }
    }
    return res;
  });
};
