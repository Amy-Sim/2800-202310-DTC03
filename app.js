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
  res.locals.session = req.session;
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
  res.render('signup', {session: req.session});
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
      .email({ minDomainSegments: 2, tlds: { allow: ['com', 'net', 'ca', 'gov', 'edu', 'co', 'org'] } })
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
    securityQuestion: Joi.string()
      .min(5)
      .max(30)
      .required()
      .messages({
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
    const { username, name, password, email, securityQuestion, securityAnswer } = await schema.validateAsync(req.body, { abortEarly: false });
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
    err.details.forEach(error => {
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
  res.redirect('/')
});

app.get('/login', (req, res) => {
  res.render('login', {session: req.session});
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
      username: req.body.username
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
  res.render('forget_username', { session: req.session });
});

app.post('/display_username', async (req, res) => {
  const email = req.body.email;

  try {
    const user = await usersModel.findOne({ email: email });

    if (user) {
      res.render('display_username', { username: user.username, session: req.session });
    } else {
      res.render('user_not_found', { session: req.session });
    }
  } catch (error) {
    console.log(error);
  }
});

app.get('/forget_password', (req, res) => { 
  res.render('forget_password', { session: req.session });
});

app.post('/submit_security_question', async (req, res) => {
  try {
    const user = await usersModel.findOne({
      username: req.body.username,
      email: req.body.email,
    });
    if (user) {
      res.render('enter_security_question', {
        user: user,
        securityQuestion: user.securityQuestion,
      });
      console.log(user.securityAnswer);
      console.log(user);
    } else {
      res.render('password_change_error', { message: 'User not found.' });
    }
  } catch (error) {
    console.log(error);
  }
});

app.post('/submit_security_answer', async (req, res) => {
  try {
    const user = await usersModel.findOne({ _id: req.body.userId });
    if ( user && req.body.securityAnswer && user.securityAnswer &&bcrypt.compareSync(req.body.securityAnswer, user.securityAnswer)
    ) {
      req.session.loggedName = user.name;
      req.session.loggedUsername = user.username;
      req.session.loggedEmail = user.email;
      req.session.loggedPassword = user.password;
      req.session.securityQuestion = user.securityQuestion;
      req.session.securityAnswer = user.securityAnswer;

      // Set the req.session.user object
      req.session.user = { _id: user._id };

      res.render('create_new_password', { user: user, securityAnswer: user.securityAnswer });
    } else {
      res.render('security_question_error');
    }
  } catch (error) {
    console.log(error);
  }
});


app.get('/enter_security_question', (req, res) => {
  res.render('enter_security_question');
});

app.post('/reset_password', async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;
    const schema = Joi.object({
      password: Joi.string().min(5).max(30).required().messages({
        'string.max': 'Password must be between 5 and 30 characters long.',
        'string.min': 'Password must be between 5 and 30 characters long.',
        'string.empty': 'Please provide a password.',
      }),
      confirmPassword: Joi.string()
        .valid(Joi.ref('password'))
        .required()
        .messages({
          'any.only': 'Passwords do not match.',
        }),
    });

    const { error } = await schema.validate({ password, confirmPassword });
    if (error) {
      const errorMessage = error.details[0].message;
      res.render('reset_password_error', {
        errorMessage: errorMessage,
      });
    } else {
      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);

      await usersModel.updateOne(
        { _id: req.session.user._id },
        { password: hashedPassword }
      );
      res.render('reset_password_success')
    }
  } catch (error) {
    console.log(error);
  }
});

app.get('/create_new_password', (req, res) => {
  res.render('create_new_password');
});

app.get('/profile', (req, res) => {
  res.render('profile', {session: req.session, disableFields: true});
});

app.post('/profileSubmit', async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().alphanum().min(5).max(15).required().messages({
      'string.alphanum': 'Name must only contain alphanumeric characters.',
      'string.min': 'Name must be between 5 to 15 characters long.',
      'string.max': 'Name must be between 5 to 15 characters long.',
      'string.empty': 'Please provide a name.',
    }),
    email: Joi.string()
      .email({ minDomainSegments: 2, tlds: { allow: ['com', 'net', 'ca', 'gov', 'edu', 'co', 'org'] } })
      .required()
      .messages({
        'string.email': 'Please provide a valid email address.',
        'string.empty': 'Please provide an email.',
      }),
  }).options({ allowUnknown: true });

  try {
    // validate input
    const { name, email } = await schema.validateAsync(req.body, { abortEarly: false });
  
    // update user
    const updatedUser = await usersModel.findOneAndUpdate(
      { username: req.session.loggedUsername },
      { $set: { name: name, email: email } },
      { new: true }
    );
    console.log(updatedUser);
  
    // update session data
    req.session.loggedName = name;
    req.session.loggedEmail = email;
  
    // redirect to profile page
    res.redirect('/profile');
  } catch (err) {
    console.log(err);
    // pass error messages to response locals
    res.locals.errors = err.details.map((error) => ({
      message: error.message,
    }));
    // render the profile page with errors
    res.render('profile', { title: 'My Account', session: req.session, disableFields: false });
  }
  
});

app.get('/profile_change_password', (req, res) => {
  res.render('profile_change_password', {session: req.session});
});

app.post('/profile_change_password', async (req, res) => {
  const { password, confirmPassword} = req.body;
  const schema = Joi.object({
    password: Joi.string().min(5).max(30).required().messages({
      'string.max': 'Password must be between 5 and 30 characters long.',
      'string.min': 'Password must be between 5 and 30 characters long.',
      'string.empty': 'Please provide a password.',
    }),
    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match.',
      }),
  });

  const { error } = await schema.validate({ password, confirmPassword });
  if (error) {
    res.locals.errors = error.details.map((error) => ({
      message: error.message,
    }));
    // render the profile page with errors
    res.render('profile_change_password', { session: req.session});
  } else {
    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    await usersModel.updateOne(
      { username: req.session.loggedUsername },
      { password: hashedPassword }
    );
    res.redirect('/profile');
  }
});

app.get('/does_not_exist', (req, res) => {
  res.status(404).render('404', {session: req.session});
});

app.use(express.static('public'));
app.get('/pantry', async (req, res) => {
  if (!req.session.GLOBAL_AUTHENTICATED) {
    res.redirect('/');
  } else {
      const user = await usersModel.findOne({username: req.session.loggedUsername});
      res.render('pantry', {
        session: req.session,
        pantryItems: user.pantry
      });
  }
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
