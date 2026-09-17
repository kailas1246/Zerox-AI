
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {

  const navigate = useNavigate();

  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();

    setError("");

    if (!email || !password || (isSignup && !name)) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    // LocalStorage user helpers
    const USERS_KEY = "zerox_users";
    const CURRENT_KEY = "zerox_current_user";

    const getUsers = () => {
      try {
        const raw = localStorage.getItem(USERS_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (err) {
        return [];
      }
    };

    const saveUsers = (users) => {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    };

    const normalizeEmail = (s) => s.trim().toLowerCase();
    const emailNorm = normalizeEmail(email);

    if (isSignup) {
      const users = getUsers();
      if (users.find((u) => u.email === emailNorm)) {
        setError("An account with that email already exists.");
        return;
      }

      const newUser = {
        email: emailNorm,
        name: name.trim(),
        password: password,
      };

      users.push(newUser);
      saveUsers(users);
      localStorage.setItem(CURRENT_KEY, JSON.stringify({ email: newUser.email, name: newUser.name }));

      // clear sensitive inputs then navigate
      setPassword("");
      navigate("/chat");
      return;
    }

    // Login flow
    const users = getUsers();
    const found = users.find((u) => u.email === emailNorm && u.password === password);

    if (!found) {
      setError("Invalid email or password.");
      return;
    }

    localStorage.setItem(CURRENT_KEY, JSON.stringify({ email: found.email, name: found.name }));
    setPassword("");
    navigate("/chat");
  }

  return (
    <>
      <style>{`

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #050505;
        }

        .auth-page {
          min-height: 100vh;
          background: #050505;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .auth-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          background: radial-gradient(
            circle,
            #8b5cf633,
            transparent 70%
          );
          animation: authGlow 8s ease-in-out infinite alternate;
        }

        @keyframes authGlow {
          from {
            transform: translate(-180px, -100px);
          }

          to {
            transform: translate(180px, 100px);
          }
        }

        .auth-grid {
          position: absolute;
          inset: 0;
          opacity: .12;
          background-image:
            linear-gradient(#fff 1px, transparent 1px),
            linear-gradient(90deg, #fff 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(
            ellipse at center,
            black,
            transparent 75%
          );
        }

        .auth-card {
          width: 100%;
          max-width: 430px;
          padding: 42px;
          background: #ffffff08;
          border: 1px solid #ffffff18;
          border-radius: 28px;
          backdrop-filter: blur(24px);
          box-shadow: 0 0 80px #000;
          position: relative;
          z-index: 2;
          animation: authEnter .9s ease both;
        }

        @keyframes authEnter {
          from {
            opacity: 0;
            transform: translateY(35px) scale(.96);
            filter: blur(12px);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        .auth-logo {
          width: 48px;
          height: 48px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          background: linear-gradient(
            135deg,
            #a78bfa,
            #6366f1
          );
          box-shadow: 0 0 35px #6366f144;
          font-size: 24px;
          font-weight: 900;
          margin-bottom: 24px;
        }

        .auth-card h1 {
          font-size: 34px;
          letter-spacing: -1.5px;
          margin: 0 0 10px;
        }

        .auth-subtitle {
          color: #999;
          font-size: 14px;
          line-height: 1.6;
          margin-bottom: 28px;
        }

        .auth-switch {
          display: flex;
          gap: 5px;
          padding: 5px;
          background: #ffffff08;
          border: 1px solid #ffffff12;
          border-radius: 13px;
          margin-bottom: 25px;
        }

        .auth-switch button {
          flex: 1;
          padding: 12px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: #888;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
        }

        .auth-switch button.active {
          background: white;
          color: black;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .auth-form label {
          font-size: 12px;
          color: #aaa;
          margin-bottom: -8px;
        }

        .auth-form input {
          width: 100%;
          padding: 15px;
          border-radius: 12px;
          border: 1px solid #ffffff18;
          background: #ffffff08;
          color: white;
          outline: none;
          font-size: 14px;
        }

        .auth-form input:focus {
          border-color: #a78bfa;
          box-shadow: 0 0 0 3px #a78bfa18;
        }

        .auth-form input::placeholder {
          color: #666;
        }

        .auth-submit {
          margin-top: 8px;
          padding: 16px;
          border: 0;
          border-radius: 12px;
          background: linear-gradient(
            135deg,
            #a78bfa,
            #6366f1
          );
          color: white;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: transform .2s, box-shadow .2s;
        }

        .auth-submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px #6366f144;
        }

        .auth-error {
          color: #f87171;
          font-size: 12px;
          text-align: center;
        }

        .auth-bottom {
          color: #777;
          font-size: 12px;
          text-align: center;
          margin-top: 25px;
          line-height: 1.6;
        }

        @media (max-width: 500px) {
          .auth-card {
            padding: 28px 22px;
          }

          .auth-card h1 {
            font-size: 29px;
          }
        }

      `}</style>

      <div className="auth-page">

        <div className="auth-glow"></div>
        <div className="auth-grid"></div>

        <div className="auth-card">

          <div className="auth-logo">Z</div>

          <h1>
            {isSignup ? "Create your account" : "Welcome to ZEROX"}
          </h1>

          <p className="auth-subtitle">
            {isSignup
              ? "Join the next generation of intelligent conversations."
              : "Your AI workspace. Built for ideas, code, and everything in between."
            }
          </p>

          <div className="auth-switch">

            <button
              className={!isSignup ? "active" : ""}
              onClick={() => {
                setIsSignup(false);
                setError("");
              }}
            >
              Login
            </button>

            <button
              className={isSignup ? "active" : ""}
              onClick={() => {
                setIsSignup(true);
                setError("");
              }}
            >
              Sign up
            </button>

          </div>

          <form className="auth-form" onSubmit={handleSubmit}>

            {isSignup && (
              <>
                <label>Full name</label>

                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </>
            )}

            <label>Email address</label>

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label>Password</label>

            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <p className="auth-error">{error}</p>
            )}

            <button className="auth-submit" type="submit">
              {isSignup ? "Create account →" : "Enter ZEROX →"}
            </button>

          </form>

          <p className="auth-bottom">
            {isSignup
              ? "Already have an account? Switch to Login above."
              : "New to ZEROX? Switch to Sign up above."
            }
          </p>

        </div>

      </div>
    </>
  );
}