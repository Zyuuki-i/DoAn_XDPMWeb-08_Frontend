import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import $ from 'jquery';
import JSZip from 'jszip';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

import 'datatables.net-dt';
import 'datatables.net-buttons';
import 'datatables.net-buttons/js/buttons.html5';
import 'datatables.net-buttons/js/buttons.print';
import 'datatables.net-dt/css/dataTables.dataTables.css';
import 'datatables.net-buttons-dt/css/buttons.dataTables.css';

import './App.css';

pdfMake.vfs = pdfFonts?.pdfMake?.vfs || pdfFonts?.vfs || {};
window.JSZip = JSZip;
window.pdfMake = pdfMake;

const API_URL = 'http://localhost:8000';
const FALLBACK_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">' +
      '<rect width="60" height="60" fill="#e5e7eb"/>' +
      '<text x="30" y="34" text-anchor="middle" font-size="10" fill="#6b7280" font-family="Segoe UI, sans-serif">No Image</text>' +
    '</svg>'
  );

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [username, setUsername] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('customer');
  const [editingUser, setEditingUser] = useState(null);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const tableRef = useRef(null);

  const path = window.location.pathname.replace(/\/+$/, '');
  const isUsersPage = path === '/users';

  useEffect(() => {
    let isMounted = true;

    const fetchProducts = async (retry = true) => {
      try {
        setLoading(true);

        const response = await axios.get(
          `${API_URL}/api/products`,
          { timeout: 30000 }
        );

        if (!isMounted) return;

        const payload = response?.data;
        const list = Array.isArray(payload)
          ? payload
          : payload?.data || [];

        setProducts(list);
        setError('');
      } catch (err) {
        if (!isMounted) return;

        if (retry && (err.code === 'ECONNABORTED' || !err.response)) {
          console.log('Retrying after cold start...');
          setTimeout(() => fetchProducts(false), 5000);
          return;
        }

        setProducts([]);
        setError(
          err?.response?.status
            ? `Lỗi API ${err.response.status}`
            : 'Không kết nối được API'
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchUsers = async (retry = 1) => {
    try {
      const response = await axios.get(`${API_URL}/api/users`, {
        timeout: 30000
      });

      const payload = response?.data;
      const list = Array.isArray(payload) ? payload : payload?.data || [];

      setUsers(list);
      setUsersError('');
    } catch (err) {
      if (retry > 0) {
        console.log("Retry API users...");
        return fetchUsers(retry - 1);
      }

      setUsers([]);
      setUsersError(
        err?.response?.status
          ? `Lỗi API ${err.response.status}`
          : 'Không kết nối được API'
      );
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    await fetchUsers(1);
    setUsersLoading(false);
  };

  useEffect(() => {
    if (!isUsersPage) return;
    loadUsers();
  }, [isUsersPage]);

  const resetUserForm = () => {
    setUsername('');
    setUserEmail('');
    setUserPassword('');
    setUserRole('customer');
    setEditingUser(null);
  };

  const startEditingUser = (user) => {
    setEditingUser(user);
    setUsername(user.username || '');
    setUserEmail(user.email || '');
    setUserRole(['admin','customer'].includes(user.role) ? user.role : 'customer');
    setUserPassword('');
  };

  const submitUserForm = async (event) => {
    event.preventDefault();

    try {
      const payload = {
        username: username.trim(),
        email: userEmail.trim(),
        password: userPassword.trim(),
        full_name: username.trim(),
        address: '',
        phone: '',
        role: userRole,
      };

      if (editingUser && !payload.password) {
        delete payload.password;
      }

      console.log('Submitting user form', { payload, editingUser });

      if (editingUser) {
        await axios.put(`${API_URL}/api/users/${editingUser.id}`, payload);
      } else {
        await axios.post(`${API_URL}/api/users`, payload);
      }

      resetUserForm();
      loadUsers();
    } catch (err) {
      console.error('User request failed', err.response?.data || err);

      let message = '';

      if (err?.response) {
        const data = err.response.data;

        if (data?.message) message = data.message;
        else if (data?.errors)
          message = Object.values(data.errors).flat().join(' | ');
        else message = `Lỗi API ${err.response.status}`;
      } else {
        message = 'Không kết nối được API';
      }

      setUsersError(message);
    }
  };

  const deleteUser = (id) => {
    if (!window.confirm('Xác nhận xóa user này?')) {
      return;
    }

    axios
      .delete(`${API_URL}/api/users/${id}`)
      .then(() => {
        if (editingUser?.id === id) {
          resetUserForm();
        }

        loadUsers();
      })
      .catch((err) => {
        console.error('Delete user failed', err);
        let message = '';
        if (err?.response) {
          const data = err.response.data;
          if (data?.message) {
            message = data.message;
          } else if (data?.errors) {
            message = Object.values(data.errors).flat().join(' | ');
          } else {
            message = `Lỗi API ${err.response.status}`;
          }
        } else {
          message = 'Không kết nối được API';
        }
        setUsersError(message);
      });
  };

  useEffect(() => {
    if (!tableRef.current) {
      return;
    }

    if ($.fn.dataTable.isDataTable(tableRef.current)) {
      $(tableRef.current).DataTable().destroy();
    }

    if (products.length === 0) {
      return;
    }

    const table = $(tableRef.current).DataTable({
      pageLength: 8,
      lengthChange: false,
      dom: 'Bfrtip',
      buttons: ['copy', 'excel', 'pdf', 'print'],
    });

    return () => {
      table.destroy();
    };
  }, [products]);

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id, quantity) => {
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      setCart((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity: qty } : item))
    );
  };

  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const total = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const formatPrice = (value) =>
    new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(value);

  const openDetail = (product) => {
    setSelectedProduct(product);
  };

  const closeDetail = () => {
    setSelectedProduct(null);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand__logo">S</span>
          <div>
            <h1>Phone8</h1>
            <p>Điện thoại chính hãng - Giá tốt mỗi ngày</p>
          </div>
        </div>
        <nav className="nav">
          {}
          <a href={isUsersPage ? '/#products' : '#products'}>Sản phẩm</a>
          <a href="#cart">Giỏ hàng</a>
          <a href="/users">Người dùng</a>
          <a href="#footer">Liên hệ</a>
        </nav>
      </header>

      <section className="hero">
        <div>
          <h2>Khám phá smartphone mới nhất</h2>
          <p>
            Danh sách sản phẩm được lấy từ database và hiển thị bằng DataTable.
          </p>
          <button className="primary">Mua ngay</button>
        </div>
        <div className="hero__card">
          <h3>Ưu đãi hôm nay</h3>
          <ul>
            <li>Giảm đến 15%</li>
            <li>Trả góp 0%</li>
            <li>Bảo hành 12 tháng</li>
          </ul>
        </div>
      </section>

      <main className="content">
        {isUsersPage ? (
          <section className="card">
            <div className="card__header">
              <h2>Quản lý users</h2>
              <span>Thêm / Sửa / Xóa (CRUD) users</span>
            </div>

            <form className="user-form" onSubmit={submitUserForm}>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
              <input
                type="email"
                placeholder="Email"
                value={userEmail}
                onChange={(event) => setUserEmail(event.target.value)}
              />
              <select
                value={userRole}
                onChange={(e) => setUserRole(e.target.value)}
              >
                <option value="customer">Khách hàng</option>
                <option value="admin">Quản trị</option>
              </select>
              <input
                type="text"
                placeholder={editingUser ? 'Mật khẩu mới' : 'Mật khẩu'}
                value={userPassword}
                onChange={(event) => setUserPassword(event.target.value)}
              />
              <button type="submit" className="primary">
                {editingUser ? 'Cập nhật' : 'Thêm mới'}
              </button>
              {editingUser && (
                <button type="button" onClick={resetUserForm}>
                  Hủy
                </button>
              )}
            </form>

            {usersError && (
              <p className="muted">
                {usersError}. Kiểm tra backend chạy ở {API_URL}.
              </p>
            )}
            {!usersError && usersLoading && (
              <p className="muted">Đang tải dữ liệu users...</p>
            )}

            <div className="table-wrapper">
              <table className="display">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td>
                        <div className="action-group">
                          <button
                            type="button"
                            className="action"
                            onClick={() => startEditingUser(user)}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => deleteUser(user.id)}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <>
            <section id="products" className="card">
              <div className="card__header">
                <h2>Danh sách điện thoại</h2>
                <span>
                  DataTable: tìm kiếm, phân trang, export • {products.length}{' '}
                  sản phẩm
                </span>
              </div>
              {error && (
                <p className="muted">
                  {error}. Kiểm tra backend chạy ở {API_URL}.
                </p>
              )}
              {!error && loading && <p className="muted">Đang tải dữ liệu...</p>}
              <div className="table-wrapper">
                <table ref={tableRef} className="display">
                  <thead>
                    <tr>
                      <th>Hình</th>
                      <th>Tên</th>
                      <th>Hãng</th>
                      <th>Giá</th>
                      <th>Tồn kho</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="product-image"
                            onError={(event) => {
                              event.currentTarget.src = FALLBACK_IMAGE;
                            }}
                          />
                        </td>
                        <td>
                          <strong>{product.name}</strong>
                          <div className="muted">{product.category}</div>
                        </td>
                        <td>{product.brand}</td>
                        <td>{formatPrice(product.price)}</td>
                        <td>{product.stock}</td>
                        <td>
                          <button
                            className="action"
                            onClick={() => addToCart(product)}
                          >
                            Thêm vào giỏ
                          </button>
                          <button
                            className="action secondary"
                            onClick={() => openDetail(product)}
                          >
                            Xem chi tiết
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="cart" className="card cart">
              <div className="card__header">
                <h2>Giỏ hàng</h2>
                <span>{cart.length} sản phẩm</span>
              </div>

              {cart.length === 0 ? (
                <p className="muted">Chưa có sản phẩm trong giỏ.</p>
              ) : (
                <div className="cart__list">
                  {cart.map((item) => (
                    <div key={item.id} className="cart__item">
                      <div>
                        <h4>{item.name}</h4>
                        <p className="muted">{formatPrice(item.price)}</p>
                      </div>
                      <div className="cart__actions">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) =>
                            updateQuantity(item.id, event.target.value)
                          }
                        />
                        <button
                          className="danger"
                          onClick={() => removeFromCart(item.id)}
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="cart__total">
                <span>Tổng cộng:</span>
                <strong>{formatPrice(total)}</strong>
              </div>
            </section>
          </>
        )}
      </main>

      <footer id="footer" className="footer">
        <p>Phone8 - Hotline: 1900 8888 - TP.HCM</p>
      </footer>

      {selectedProduct && (
        <div className="modal" onClick={closeDetail}>
          <div className="modal__content" onClick={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <h3>{selectedProduct.name}</h3>
              <button className="modal__close" onClick={closeDetail}>
                ✕
              </button>
            </div>
            <div className="modal__body">
              <img
                src={selectedProduct.image_url}
                alt={selectedProduct.name}
                className="modal__image"
                onError={(event) => {
                  event.currentTarget.src = FALLBACK_IMAGE;
                }}
              />
              <div className="modal__info">
                <p>
                  <strong>Hãng:</strong> {selectedProduct.brand}
                </p>
                <p>
                  <strong>Danh mục:</strong> {selectedProduct.category}
                </p>
                <p>
                  <strong>Giá:</strong> {formatPrice(selectedProduct.price)}
                </p>
                <p>
                  <strong>Tồn kho:</strong> {selectedProduct.stock}
                </p>
                <p>
                  <strong>Màn hình:</strong> {selectedProduct.screen}
                </p>
                <p>
                  <strong>CPU:</strong> {selectedProduct.cpu}
                </p>
                <p>
                  <strong>RAM:</strong> {selectedProduct.ram}
                </p>
                <p>
                  <strong>Bộ nhớ:</strong> {selectedProduct.storage}
                </p>
                <p>
                  <strong>Pin:</strong> {selectedProduct.battery}
                </p>
                <p>
                  <strong>Hệ điều hành:</strong> {selectedProduct.os}
                </p>
                <p>
                  <strong>Mô tả:</strong> {selectedProduct.description}
                </p>
              </div>
            </div>
            <div className="modal__footer">
              <button
                className="primary"
                onClick={() => addToCart(selectedProduct)}
              >
                Thêm vào giỏ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
