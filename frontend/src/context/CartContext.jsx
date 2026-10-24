import { createContext, useContext, useReducer } from 'react';

const CartContext = createContext(null);

const initialState = { items: [], customer: null, prescription: null, discount: 0, gstRate: 0, paymentMethod: 'cash' };

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(i => i.medicine_id === action.payload.medicine_id);
      if (existing) {
        return { ...state, items: state.items.map(i => i.medicine_id === action.payload.medicine_id ? { ...i, quantity: i.quantity + 1 } : i) };
      }
      return { ...state, items: [...state.items, { ...action.payload, quantity: 1 }] };
    }
    case 'UPDATE_QTY':
      return { ...state, items: state.items.map(i => i.medicine_id === action.payload.id ? { ...i, quantity: action.payload.qty } : i).filter(i => i.quantity > 0) };
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i.medicine_id !== action.payload) };
    case 'SET_CUSTOMER':
      return { ...state, customer: action.payload };
    case 'SET_PRESCRIPTION':
      return { ...state, prescription: action.payload };
    case 'SET_DISCOUNT':
      return { ...state, discount: action.payload };
    case 'SET_GST':
      return { ...state, gstRate: action.payload };
    case 'SET_PAYMENT':
      return { ...state, paymentMethod: action.payload };
    case 'CLEAR':
      return initialState;
    case 'LOAD_PRESCRIPTION_ITEMS':
      return { ...state, items: action.payload };
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  const subtotal = state.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const discountAmount = subtotal * (state.discount / 100);
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (state.gstRate / 100);
  const total = taxableAmount + taxAmount;

  return (
    <CartContext.Provider value={{ ...state, dispatch, subtotal, discountAmount, taxAmount, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be inside CartProvider');
  return context;
}
