import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';

export default function CartModal({ cart, setCart, onClose }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const remove = (name) => setCart((current) => current.filter((item) => item.name !== name));

  const checkout = () => {
    if (!cart.length) return;
    onClose();
    showToast('Redirecting to payment page...');
    navigate(`/payment?plan=Shop+Order&amount=${total}`);
  };

  return (
    <div className="modal-overlay active" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box">
        <button type="button" className="modal-close" onClick={onClose}>x</button>
        <h2 className="modal-title">Your Cart</h2>
        <div className="modal-body">
          {cart.length === 0 ? (
            <p className="shop-empty">Your cart is empty.</p>
          ) : (
            <>
              {cart.map((item) => (
                <div key={item.name} className="cart-row">
                  <div>
                    <div className="cart-row-name">{item.name}</div>
                    <div className="cart-row-meta">x {item.qty} = Rs. {(item.price * item.qty).toLocaleString()}</div>
                  </div>
                  <button type="button" className="cart-remove-button" onClick={() => remove(item.name)}>Remove</button>
                </div>
              ))}
              <div className="cart-total-row">
                <span>Total</span>
                <span>Rs. {total.toLocaleString()}</span>
              </div>
              <button type="button" className="btn-red btn-full" style={{ marginTop: '1rem' }} onClick={checkout}>
                Continue to Payment
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
