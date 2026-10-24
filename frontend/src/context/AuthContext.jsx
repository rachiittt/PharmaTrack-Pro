import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';
import { safeGetJSON, safeSetJSON, safeRemove } from '../utils/storage';

const AuthContext = createContext(null);

// Demo users for working without backend
const DEMO_USERS = {
  'admin@pharmacy.com': {
    id: 'demo-admin-001',
    email: 'admin@pharmacy.com',
    full_name: 'Rajesh Kumar',
    role: 'admin',
    pharmacy_name: 'Kumar Medical Store',
    phone: '+91 98765 43210',
    gst_number: '07AABCU9603R1ZM',
    plan: 'pro',
    created_at: '2026-01-15T10:00:00Z',
  },
  'staff@pharmacy.com': {
    id: 'demo-staff-001',
    email: 'staff@pharmacy.com',
    full_name: 'Priya Sharma',
    role: 'pharmacist',
    pharmacy_name: 'Kumar Medical Store',
    phone: '+91 87654 32109',
    plan: 'pro',
    created_at: '2026-02-01T10:00:00Z',
  },
};

const DEMO_PASSWORDS = {
  'admin@pharmacy.com': 'Admin123!',
  'staff@pharmacy.com': 'Staff123!',
};

const initialState = {
  user: safeGetJSON('spms_user', null),
  session: safeGetJSON('spms_session', null),
  loading: true,
  isDemo: safeGetJSON('spms_demo', false),
};

function authReducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload, loading: false };
    case 'SET_SESSION':
      return { ...state, session: action.payload };
    case 'SET_DEMO':
      return { ...state, isDemo: action.payload };
    case 'LOGOUT':
      return { user: null, session: null, loading: false, isDemo: false };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Verify session on mount
  useEffect(() => {
    const verifySession = async () => {
      const isDemoStored = safeGetJSON('spms_demo', false);
      // If demo mode, restore user immediately
      if ((state.isDemo || isDemoStored) && state.user) {
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }

      if (state.session?.access_token) {
        try {
          const res = await authAPI.me();
          dispatch({ type: 'SET_USER', payload: res.data });
        } catch (err) {
          if (err.response?.status === 401) {
            // Token invalid — clear and redirect
            safeRemove('spms_session');
            safeRemove('spms_user');
            safeRemove('spms_demo');
            dispatch({ type: 'LOGOUT' });
          } else {
            // Server connectivity issue or offline — preserve local session
            dispatch({ type: 'SET_LOADING', payload: false });
          }
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };
    verifySession();
  }, []);

  const login = useCallback(async (email, password) => {
    // Check demo credentials first
    const demoUser = DEMO_USERS[email.toLowerCase()];
    const demoPass = DEMO_PASSWORDS[email.toLowerCase()];

    if (demoUser && password === demoPass) {
      const session = { access_token: `demo_token_${Date.now()}`, token_type: 'bearer', expires_in: 86400 };
      safeSetJSON('spms_user', demoUser);
      safeSetJSON('spms_session', session);
      safeSetJSON('spms_demo', true);
      dispatch({ type: 'SET_USER', payload: demoUser });
      dispatch({ type: 'SET_SESSION', payload: session });
      dispatch({ type: 'SET_DEMO', payload: true });
      return demoUser;
    }

    // Try real backend login
    try {
      const res = await authAPI.login({ email, password });
      const { user, session } = res.data;
      safeSetJSON('spms_user', user);
      safeSetJSON('spms_session', session);
      safeRemove('spms_demo');
      dispatch({ type: 'SET_USER', payload: user });
      dispatch({ type: 'SET_SESSION', payload: session });
      dispatch({ type: 'SET_DEMO', payload: false });
      return user;
    } catch (err) {
      // If backend unreachable and demo credentials match, still allow
      if (demoUser) {
        throw new Error('Invalid password for demo account');
      }
      throw err;
    }
  }, []);

  const signup = useCallback(async (data) => {
    try {
      const res = await authAPI.signup(data);
      const { user, session } = res.data;
      safeSetJSON('spms_user', user);
      safeSetJSON('spms_session', session);
      safeRemove('spms_demo');
      dispatch({ type: 'SET_USER', payload: user });
      dispatch({ type: 'SET_SESSION', payload: session });
      dispatch({ type: 'SET_DEMO', payload: false });
      return user;
    } catch (err) {
      // If backend unavailable, create demo session for new signup
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
        const demoNewUser = {
          id: `demo-${Date.now()}`,
          email: data.email,
          full_name: data.full_name,
          role: 'admin',
          pharmacy_name: data.pharmacy_name || 'My Pharmacy',
          phone: data.phone || '',
          plan: 'free',
          created_at: new Date().toISOString(),
        };
        const session = { access_token: `demo_token_${Date.now()}`, token_type: 'bearer', expires_in: 86400 };
        safeSetJSON('spms_user', demoNewUser);
        safeSetJSON('spms_session', session);
        safeSetJSON('spms_demo', true);
        dispatch({ type: 'SET_USER', payload: demoNewUser });
        dispatch({ type: 'SET_SESSION', payload: session });
        dispatch({ type: 'SET_DEMO', payload: true });
        toast('Running in demo mode — no backend connected', { icon: '🔧' });
        return demoNewUser;
      }
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    safeRemove('spms_session');
    safeRemove('spms_user');
    safeRemove('spms_demo');
    dispatch({ type: 'LOGOUT' });
  }, []);

  const updateProfile = useCallback(async (data) => {
    if (state.isDemo) {
      const updated = { ...state.user, ...data };
      safeSetJSON('spms_user', updated);
      dispatch({ type: 'SET_USER', payload: updated });
      return updated;
    }
    const res = await authAPI.updateProfile(data);
    const updated = res.data;
    safeSetJSON('spms_user', updated);
    dispatch({ type: 'SET_USER', payload: updated });
    return updated;
  }, [state.isDemo, state.user]);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be inside AuthProvider');
  return context;
}
