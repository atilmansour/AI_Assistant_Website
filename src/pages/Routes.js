import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect,
} from "react-router-dom";

//First, we are importing all the pages and conditions we have. Each page (other than the ThankYou.js), is a condition in your experiment
//You may add or duplicate .js files into the pages folder to edit or add additional conditions
import ThankYou from "./ThankYou";
import ParticipantInitiated from "./ParticipantInitiated";
import ToggleableLLM from "./ToggleableLLM";
import NoLLM from "./NoLLM";
import AlwaysVisibleLLM from "./AlwaysVisibleLLM";
import OnlyChat from "./OnlyChat";
import AdminLogin from "./admin/AdminLogin";
import AdminPanel from "./admin/AdminPanel";

const AdminRoute = () => {
  if (!sessionStorage.getItem("adminToken")) {
    return <Redirect to="/admin/login" />;
  }

  return <AdminPanel />;
};

const Routes = () => {
  return (
    <Router>
      <Switch>
        <Route path="/admin/login" component={AdminLogin} />
        {/*Here is the addition to your web address https//XXXX/admin/login, you may change to your liking*/}
        <Route path="/admin" component={AdminRoute} />
        <Route path="/b" component={ParticipantInitiated} />{" "}
        {/*Here is the addition to your web address https//XXXX/b, you may change to your liking*/}
        <Route path="/o" component={ToggleableLLM} />
        {/*Here is the addition to your web address https//XXXX/o, you may change to your liking*/}
        <Route path="/u" component={AlwaysVisibleLLM} />
        {/*Here is the addition to your web address https//XXXX/u, you may change to your liking*/}
        <Route path="/c" component={NoLLM} />
        {/*Here is the addition to your web address https//XXXX/c, you may change to your liking*/}
        <Route path="/a" component={OnlyChat} />
        {/*Here is the addition to your web address https//XXXX/a, you may change to your liking*/}
        <Route exact path="/" component={ThankYou} />{" "}
        {/*Here is the addition to your web address https//XXXX/ */}
      </Switch>
      {/*Please make sure that this addition is only meaningful to you! As we do not want the users to know in which experimental condition they are.*/}
    </Router>
  );
};

export default Routes;
