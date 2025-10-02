import { Menu, Container, Icon } from "semantic-ui-react";
import { Link } from "react-router-dom";
import Meruq from "../assets/MeruQ-Group.png";
export const Home = () => {
  return (
    <Container fluid style={{ padding: 0 }}>
      <Menu
        fixed="top"
        borderless
        style={{
          backgroundColor: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
          minHeight: 64,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Menu.Item
          as={Link}
          to="/dropzone"
          style={{ display: "flex", alignItems: "center" }}
        >
          <Icon
            size="large"
            color="teal"
            name="inbox"
            style={{ marginRight: 10 }}
          />
          <span
            style={{
              color: "#2185d0",
              fontSize: "20px",
              fontWeight: 600,
              letterSpacing: 1,
            }}
          >
            Ingreso de artículos masivo
          </span>
        </Menu.Item>
        <Menu.Menu position="right">
          <Menu.Item>
            <img
              src={Meruq}
              alt="logo"
              style={{ height: 40, objectFit: "contain" }}
            />
          </Menu.Item>
        </Menu.Menu>
      </Menu>
    </Container>
  );
};
