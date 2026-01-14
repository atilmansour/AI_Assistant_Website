import { Link } from "react-router-dom";

const Button = ({ title, onClick, to }) => {
  return (
    <Link to={to}>
      <button onClick={onClick}>{title}</button>
    </Link>
  );
};

export default Button;
