const express = require('express');
const app = express();
const session = require('express-session');
const usersModel = require('./models/users');
const MongoDBStore = require('connect-mongodb-session')(session);
const bcrypt = require('bcrypt');
const Joi = require('joi');
const url = require('url');
// 1 - import
let ejs = require('ejs');
// 2 - set the view engine to ejs
app.set('view engine', 'ejs');

const navLinks = [
  { label: 'Home', path: '/' },
  { label: 'Sign Up', path: '/signup' },
  { label: 'Login', path: '/login' },
];

const dotenv = require('dotenv');
const { error } = require('console');
dotenv.config();

const dbStore = new MongoDBStore({
  uri: `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`,
  collection: 'mySessions',
  expires: 1000 * 60 * 60, // 60 minutes
});

app.use(
  session({
    secret: `${process.env.NODE_SESSION_SECRET}`,
    store: dbStore,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use('/', (req, res, next) => {
  app.locals.navLinks = navLinks;
  app.locals.currentURL = url.parse(req.url).pathname;
  next();
});

// public routes
app.get('/', (req, res) => {
  res.render('index', {
    session: req.session,
  });
});

app.get('/signup', (req, res) => {
  res.render('signup', {});
});

app.use(express.json());
app.post('/signupSubmit', async (req, res) => {
  let errorMessage = [];
  const schema = Joi.object({
    username: Joi.string().alphanum().min(5).max(15).required().messages({
      'string.alphanum': 'Username must only contain alphanumeric characters.',
      'string.min': 'Username must be between 5 to 15 characters long.',
      'string.max': 'Username must be betwen 5 to 15 characters long.',
      'string.empty': 'Please provide a username.',
    }),
    name: Joi.string().alphanum().min(5).max(15).required().messages({
      'string.alphanum': 'Name must only contain alphanumeric characters.',
      'string.min': 'Name must be between 5 to 15 characters long.',
      'string.max': 'Username must be betwen 5 to 15 characters long.',
      'string.empty': 'Please provide a name.',
    }),
    email: Joi.string()
      .email({ minDomainSegments: 2, tlds: { allow: ['com', 'net'] } })
      .required()
      .messages({
        'string.email': 'Please provide a valid email address.',
        'string.empty': 'Please provide an email.',
      }),
    password: Joi.string().min(5).max(30).required().messages({
      'string.max': 'Password must be between 5 and 30 characters long.',
      'string.min': 'Password must be between 5 and 30 characters long.',
      'string.empty': 'Please provide a password.',
    }),
    confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords do not match.',
    }),
    securityQuestion: Joi.string().min(5).max(30).required().messages({
      'string.min':
        'Security question must be between 5 and 30 characters long.',
      'string.max':
        'Security question must be between 5 and 30 characters long.',
      'string.empty': 'Please provide a security question.',
    }),
    securityAnswer: Joi.string().alphanum().min(5).max(30).required().messages({
      'string.max': 'Security answer must be between 5 and 30 characters long.',
      'string.min': 'Security answer must be between 5 and 30 characters long.',
      'string.empty': 'Please provide a security answer.',
    }),
  }).options({ allowUnknown: true });

  try {
    const {
      username,
      name,
      password,
      email,
      securityQuestion,
      securityAnswer,
    } = await schema.validateAsync(req.body, { abortEarly: false });
    const hashedSecurityAnswer = await bcrypt.hash(securityAnswer, 10);
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      username: username,
      name: name,
      password: hashedPassword,
      email: email,
      securityQuestion: securityQuestion,
      securityAnswer: hashedSecurityAnswer,
      type: 'user',
    };
    const result = await usersModel.create(user);
    console.log(result);
    // add some user created successfully message?
  } catch (err) {
    console.log(err);
    // catch all errors and add to error message array
    err.details.forEach((error) => {
      errorMessage.push(error.message);
    });
    // render the error page with the error message array
    res.render('signupSubmitError', {
      errorMessage: errorMessage,
    });
    return;
  }
  req.session.GLOBAL_AUTHENTICATED = true;
  req.session.loggedUsername = req.body.username;
  req.session.loggedName = req.body.name;
  res.redirect('/');
});

app.get('/login', (req, res) => {
  res.render('login', {});
});

app.post('/login', async (req, res) => {
  // sanitize the input using Joi
  const schema = Joi.object({
    password: Joi.string(),
  });

  try {
    const value = await schema.validateAsync({ password: req.body.password });
  } catch (err) {
    console.log(err);
    console.log('The password has to be a string');
  }

  try {
    const result = await usersModel.findOne({
      username: req.body.username,
    });

    if (result && bcrypt.compareSync(req.body.password, result?.password)) {
      // set a global variable to true if the user is authenticated
      req.session.GLOBAL_AUTHENTICATED = true;
      req.session.loggedName = result.name;
      req.session.loggedUsername = result.username;
      req.session.loggedEmail = result.email;
      req.session.loggedPassword = result.password;
      req.session.securityQuestion = result.securityQuestion;
      req.session.securityAnswer = result.securityAnswer;
      res.redirect('/');
    } else {
      res.render('loginError', {});
    }
  } catch (error) {
    console.log(error);
  }
});

app.get('/forget_username', (req, res) => {
  res.render('forget_username');
});

app.post('/display_username', async (req, res) => {
  const email = req.body.email;

  try {
    const user = await usersModel.findOne({ email: email });

    if (user) {
      res.render('display_username', { username: user.username });
    } else {
      res.render('username_not_found');
    }
  } catch (error) {
    console.log(error);
  }
});

app.get('/forget_password', (req, res) => {
  res.render('forget_password', {
    session: req.session,
  });
});

app.post('/submit_security_question', async (req, res) => {
  console.log('Hello world!');
  try {
    const user = await usersModel.findOne({
      username: req.body.username,
      email: req.body.email,
    });
    if (user) {
      console.log('Hello world!2nd');
      res.render('enter_security_question', {
        user: user,
        securityQuestion: user.securityQuestion,
      });
      console.log(user.securityAnswer);
    } else {
      res.render('password_change_error', { message: 'User not found.' });
    }
  } catch (error) {
    console.log(error);
  }
});

app.post('/submit_security_answer', async (req, res) => {
  console.log('Hello world!!!! 3rd');
  try {
    const user = await usersModel.findOne({
      // securityQuestion: req.body.securityQuestion, 
      securityAnswer: req.body.securityAnswer,
    });
    console.log(user.securityAnswer);
    console.log(req.body.securityAnswer);
    if (
      user &&
      req.body.securityAnswer &&
      user.securityAnswer &&
      bcrypt.compareSync(req.body.securityAnswer, user.securityAnswer)
    ) {
      req.session.GLOBAL_AUTHENTICATED = true;
      req.session.loggedName = user.name;
      req.session.loggedUsername = user.username;
      req.session.loggedEmail = user.email;
      req.session.loggedPassword = user.password;
      req.session.securityQuestion = user.securityQuestion;
      req.session.securityAnswer = user.securityAnswer;
      res.render('create_new_password', {
        user: user,
        securityAnswer: user.securityAnswer,
      });
      console.log(user.securityAnswer);
      console.log(req.body.securityAnswer);
    } else {
      res.render('security_question_error');
      console.log(req.body.securityAnswer);
      console.log(
        user
          ? user.securityAnswer
          : 'User or securityAnswer is null or undefined'
      );
    }
  } catch (error) {
    console.log(error);
  }
});

app.get('/does_not_exist', (req, res) => {
  res.status(404).render('404', {});
});

app.use(express.static('public'));

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.use((req, res) => {
  res.redirect('/does_not_exist');
});

module.exports = app;
