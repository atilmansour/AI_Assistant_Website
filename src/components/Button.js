import { Link } from "react-router-dom";

//A clickable button that can run a function and then take the user to a different page in the app.

const Button = ({ title, onClick, to }) => {
  return (
    // Link handles navigation without reloading the page
    <Link to={to}>
      {/* Button handles click actions */}
      <button onClick={onClick}>{title}</button>
    </Link>
  );
};

export default Button;
