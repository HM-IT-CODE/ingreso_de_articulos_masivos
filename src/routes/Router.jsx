import { BrowserRouter, Route, Switch } from "react-router-dom";
import { Home } from "../components/Home";
import Dropzone from "../components/Dropzone";


const Routes = () => {
  return (
    <BrowserRouter>
      <Home />
      <Switch>
        <Route path="/">
          <Dropzone />
        </Route>
      </Switch>
    </BrowserRouter>
  );
};

export default Routes;
