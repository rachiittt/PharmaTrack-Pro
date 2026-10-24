import { MessageCircle } from 'lucide-react';
import { openWhatsApp } from '../../utils/whatsappUtils';

export function WhatsAppButton({ phone, message, label = 'WhatsApp', size = 'md', className = '' }) {
  return (
    <button
      onClick={() => openWhatsApp(phone, message)}
      className={`inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#20BD5A] text-white font-semibold rounded-xl transition-all active:scale-[0.98]
        ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} ${className}`}
    >
      <MessageCircle size={size === 'sm' ? 14 : 16} />
      {label}
    </button>
  );
}
