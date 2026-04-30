import { Menu, Container, Icon, Image } from "semantic-ui-react";
import { Link } from "react-router-dom";
import Meruq from "../assets/MeruQ-Group.png";

export const Home = () => {
  return (
    <div style={{ background: "var(--color-bg)" }}>
      {/* --- NAVBAR PREMIUM (No Fixed para evitar solapamiento) --- */}
      <Menu
        borderless
        style={{
          background: "#fff",
          border: "none",
          borderBottom: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-soft)",
          height: "64px",
          margin: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 1rem"
        }}
      >
        <Container fluid style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Menu.Item
              as={Link}
              to="/"
              style={{ padding: "0 10px", display: "flex", alignItems: "center", gap: "12px" }}
            >
              <div style={{ 
                background: "var(--gradient-pro)", 
                padding: "8px", 
                borderRadius: "10px", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                boxShadow: "0 4px 10px rgba(99, 102, 241, 0.2)"
              }}>
                <Icon name="archive" size="large" inverted style={{ margin: 0 }} />
              </div>
              <span style={{ 
                color: "var(--color-text-main)", 
                fontSize: "1.15rem", 
                fontWeight: 800,
                letterSpacing: "-0.02em"
              }}>
                Ingreso de Artículos Masivo
              </span>
            </Menu.Item>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
             <Image src={Meruq} style={{ height: "32px", opacity: 0.9 }} />
          </div>
        </Container>
      </Menu>
      
      {/* El contenido se renderizará debajo automáticamente por el Router.jsx */}
    </div>
  );
};
