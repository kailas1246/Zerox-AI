
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function App() {

  const navigate = useNavigate();
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {

    // Fade out after XEROX AI has been shown
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 11000);

    // Go to /chat after fade animation
    const navigateTimer = setTimeout(() => {
      navigate("/login");
    }, 12000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(navigateTimer);
    };

  }, [navigate]);


  return (
    <>
      <style>{`

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          background: #000;
          overflow: hidden;
          font-family: Arial, sans-serif;
        }


        /* =========================
           INTRO
        ========================= */

        .intro {
          width: 100%;
          height: 100vh;

          background: #000;
          color: white;

          display: flex;
          align-items: center;
          justify-content: center;

          position: relative;
          overflow: hidden;

          opacity: 1;

          transition: opacity 1s ease;
        }

        .intro.fade-out {
          opacity: 0;
        }


        /* =========================
           GRID
        ========================= */

        .grid {
          position: absolute;

          width: 200%;
          height: 200%;

          background-image:
            linear-gradient(
              #ffffff12 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              #ffffff12 1px,
              transparent 1px
            );

          background-size: 70px 70px;

          transform:
            perspective(500px)
            rotateX(65deg);

          animation:
            gridMove 4s linear infinite;
        }

        @keyframes gridMove {

          from {
            transform:
              perspective(500px)
              rotateX(65deg)
              translateY(0);
          }

          to {
            transform:
              perspective(500px)
              rotateX(65deg)
              translateY(70px);
          }

        }


        /* =========================
           GLOW
        ========================= */

        .glow {
          position: absolute;

          width: 600px;
          height: 600px;

          background:
            radial-gradient(
              circle,
              #ffffff20,
              transparent 70%
            );

          animation:
            glowMove 5s ease-in-out infinite alternate;
        }

        @keyframes glowMove {

          from {
            transform:
              translate(-250px, -100px);
          }

          to {
            transform:
              translate(250px, 100px);
          }

        }


        /* =========================
           ORBS
        ========================= */

        .orb {
          position: absolute;

          border-radius: 50%;

          background: white;

          box-shadow:
            0 0 20px white,
            0 0 60px white;
        }

        .orb1 {
          width: 7px;
          height: 7px;

          left: 20%;
          top: 30%;

          animation:
            float1 4s infinite alternate;
        }

        .orb2 {
          width: 5px;
          height: 5px;

          right: 20%;
          bottom: 30%;

          animation:
            float2 5s infinite alternate;
        }

        @keyframes float1 {

          from {
            transform:
              translate(0, 0);
          }

          to {
            transform:
              translate(120px, -80px);
          }

        }

        @keyframes float2 {

          from {
            transform:
              translate(0, 0);
          }

          to {
            transform:
              translate(-100px, 80px);
          }

        }


        /* =========================
           WORD CONTAINER
        ========================= */

        .words {
          position: absolute;

          z-index: 5;
        }


        /* =========================
           WORDS
        ========================= */

        .word {
          position: absolute;

          width: 100vw;

          left: -50vw;

          text-align: center;

          font-size: 100px;

          font-weight: 900;

          letter-spacing: -6px;

          opacity: 0;

          /*
            IMPORTANT:
            forwards = plays once
            infinite = removed
          */

          animation:
            word 2s forwards;
        }


        .word:nth-child(1) {
          animation-delay: 0s;
        }

        .word:nth-child(2) {
          animation-delay: 2s;
        }

        .word:nth-child(3) {
          animation-delay: 4s;
        }

        .word:nth-child(4) {
          animation-delay: 6s;
        }


        /* =========================
           WORD ANIMATION
        ========================= */

        @keyframes word {

          0% {
            opacity: 0;

            transform:
              scale(1.6);

            filter:
              blur(30px);
          }

          20% {
            opacity: 1;

            transform:
              scale(1);

            filter:
              blur(0);
          }

          65% {
            opacity: 1;

            transform:
              scale(1);

            filter:
              blur(0);
          }

          100% {
            opacity: 0;

            transform:
              scale(.6);

            filter:
              blur(30px);
          }

        }


        /* =========================
           XEROX AI
        ========================= */

        .final {
          position: absolute;

          z-index: 10;

          text-align: center;

          opacity: 0;

          animation:
            finalReveal 3s forwards;

          animation-delay:
            8s;
        }


        .final h1 {

          font-size: 120px;

          font-weight: 900;

          letter-spacing: -8px;

          text-shadow:
            0 0 20px #ffffff55,
            0 0 70px #ffffff22;
        }


        .final p {

          margin-top: 15px;

          color: #888;

          font-size: 14px;

          letter-spacing: 7px;
        }


        /* =========================
           FINAL REVEAL
        ========================= */

        @keyframes finalReveal {

          0% {

            opacity: 0;

            transform:
              scale(1.5);

            filter:
              blur(30px);
          }

          35% {

            opacity: 1;

            transform:
              scale(1);

            filter:
              blur(0);
          }

          100% {

            opacity: 1;

            transform:
              scale(1);

            filter:
              blur(0);
          }

        }


        /* =========================
           MOBILE
        ========================= */

        @media (max-width: 700px) {

          .word {
            font-size: 55px;

            letter-spacing: -3px;
          }

          .final h1 {
            font-size: 60px;
          }

          .final p {
            font-size: 9px;

            letter-spacing: 4px;
          }

        }

      `}</style>


      <div
        className={`intro ${fadeOut ? "fade-out" : ""}`}
      >

        {/* GRID */}

        <div className="grid"></div>


        {/* GLOW */}

        <div className="glow"></div>


        {/* LIGHT ORBS */}

        <div className="orb orb1"></div>

        <div className="orb orb2"></div>


        {/* INTRO WORDS */}

        <div className="words">

          <h1 className="word">
            INTRODUCING
          </h1>

          <h1 className="word">
            THE FUTURE
          </h1>

          <h1 className="word">
            A BRAND NEW
          </h1>

          <h1 className="word">
            EXPERIENCE
          </h1>

        </div>


        {/* FINAL LOGO */}

        <div className="final">

          <h1>
            ZEROX AI
          </h1>

          <p>
            INTELLIGENCE • DESIGN • FUTURE
          </p>

        </div>

      </div>
    </>
  );
}

