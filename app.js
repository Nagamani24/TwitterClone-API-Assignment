const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Sever is starting at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
  }
};

initializeDbAndServer();
const convertToPascalCase = (each) => {
  return {
    username: each.username,
    tweet: each.tweet,
    dateTime: each.date_time,
  };
};

//Register API (1)

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const checkUserQuery = `SELECT *
                        FROM user
                        WHERE username = '${username}';`;
  const checkUser = await db.get(checkUserQuery);
  if (checkUser === undefined) {
    if (password.length > 6) {
      const createUserQuery = `INSERT INTO user(username,password, name, gender)
                                VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
      const createUser = await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login API (2)

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const checkUserQuery = `SELECT *
                        FROM user
                        WHERE username = '${username}';`;
  const checkUser = await db.get(checkUserQuery);

  if (checkUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      checkUser.password
    );
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "nnmmii");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// Authenticate Token

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHead = request.headers["authorization"];
  if (authHead !== undefined) {
    jwtToken = authHead.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "nnmmii", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const loggedInUserQuery = `SELECT user_id
                                FROM user
                                WHERE username = '${username}';`;
  const logged_in_user = await db.get(loggedInUserQuery);
  const followingUserDetailsQuery = `SELECT following_user_id FROM user Inner Join follower 
                                        on ${logged_in_user.user_id}=follower.follower_user_id 
                                        GROUP BY following_user_id;`;
  const followingUserDetails = await db.all(followingUserDetailsQuery);

  const latestTweetsQuery = `SELECT
    user.username, tweet.tweet, tweet.date_time
  FROM
    follower
  INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
  INNER JOIN user
    ON tweet.user_id = user.user_id
  WHERE
    follower.follower_user_id = ${logged_in_user.user_id}
  ORDER BY
    tweet.date_time DESC
  LIMIT 4;`;
  const latestTweets = await db.all(latestTweetsQuery);

  response.send(latestTweets.map((each) => convertToPascalCase(each)));
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const loggedInUserQuery = `SELECT user_id
                                FROM user
                                WHERE username = '${username}';`;
  const logged_in_user = await db.get(loggedInUserQuery);
  const userFollowedListQuery = `SELECT user.name as name
                                    FROM user Inner Join follower
                                    on user.user_id = follower.following_user_id
                                    WHERE follower.follower_user_id=${logged_in_user.user_id};
                                    `;
  const userFollowedList = await db.all(userFollowedListQuery);
  response.send(userFollowedList);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const loggedInUserQuery = `SELECT user_id
                                FROM user
                                WHERE username = '${username}';`;
  const logged_in_user = await db.get(loggedInUserQuery);
  const userFollowingListQuery = `SELECT name as name
                                    FROM user Inner Join follower
                                    on user.user_id = follower.follower_user_id
                                    WHERE follower.following_user_id=${logged_in_user.user_id}`;
  const userFollowingList = await db.all(userFollowingListQuery);
  response.send(userFollowingList);
});

//API 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const loggedInUserQuery = `SELECT user_id
                                FROM user
                                WHERE username = '${username}';`;
  const logged_in_user = await db.get(loggedInUserQuery);
  const getTweetDetailsQuery = `SELECT tweet.tweet,COUNT(like_id) as likes,COUNT(reply_id) as replies,tweet.date_time as dateTime
                                    FROM follower Inner Join tweet
                                    ON follower.following_user_id=tweet.user_id
                                    Inner Join reply on tweet.tweet_id=reply.tweet_id Inner Join
                                    like on tweet.tweet_id=like.tweet_id 
                                    
                                    WHERE (tweet.tweet_id=${tweetId} and follower.follower_user_id=${logged_in_user.user_id})
                                    GROUP BY tweet.tweet_id;`;
  const getTweetDetails = await db.get(getTweetDetailsQuery);

  if (getTweetDetails === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(getTweetDetails);
  }
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const loggedInUserQuery = `SELECT user_id
                                FROM user
                                WHERE username = '${username}';`;
    const logged_in_user = await db.get(loggedInUserQuery);

    const getUsernameLikedQuery = `SELECT user.username
                                        FROM follower Inner Join tweet
                                        on follower.following_user_id=tweet.user_id
                                        Inner Join like on like.tweet_id=${tweetId}
                                        Inner Join user on follower.following_user_id=user.user_id
                                        WHERE tweet.tweet_id = ${tweetId} and follower.follower_user_id=${logged_in_user.user_id}
                                        GROUP BY user.username;`;
    const getUsernamesLiked = await db.all(getUsernameLikedQuery);
    if (getUsernamesLiked.length == 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let listOfUsernames = [];
      getUsernamesLiked.map((each) => {
        listOfUsernames.push(each.username);
      });
      response.send({ likes: listOfUsernames });
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const loggedInUserQuery = `SELECT user_id
                                FROM user
                                WHERE username = '${username}';`;
    const logged_in_user = await db.get(loggedInUserQuery);

    const getUsernameRepliedQuery = `SELECT user.name,reply
                                        FROM user Inner Join follower on 
                                        follower.following_user_id=user.user_id
                                        Inner Join tweet
                                        on follower.following_user_id=tweet.user_id
                                        Inner Join reply on tweet.tweet_id=reply.tweet_id
                                        WHERE tweet.tweet_id=${tweetId} and follower.follower_user_id=${logged_in_user.user_id}
                                        `;
    const getUsernamesReplied = await db.all(getUsernameRepliedQuery);
    if (getUsernamesReplied.length !== 0) {
      let listOfUsernames = [];
      getUsernamesReplied.map((each) => {
        listOfUsernames.push({ name: each.name, reply: each.reply });
      });
      response.send({ replies: listOfUsernames });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const loggedInUserQuery = `SELECT user_id
                                FROM user
                                WHERE username = '${username}';`;
  const logged_in_user = await db.get(loggedInUserQuery);

  const listOfTweetsQuery = `SELECT tweet,COUNT(like_id) as likes,COUNT(reply_id) as replies,date_time as dateTime
                                FROM user Inner Join tweet 
                                on user.user_id=tweet.user_id Inner Join like
                                on tweet.tweet_id=like.tweet_id inner Join reply
                                on tweet.tweet_id=reply.tweet_id
                                WHERE user.user_id=${logged_in_user.user_id}
                                GROUP BY tweet.tweet_id
                                ;`;
  const listOfTweets = await db.all(listOfTweetsQuery);
  response.send(listOfTweets);
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const createTweetQuery = `INSERT INTO tweet(tweet)
                                VALUES('${tweet}');`;
  const createTweet = await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const loggedInUserQuery = `SELECT user_id
                                FROM user
                                WHERE username = '${username}';`;
    const logged_in_user = await db.get(loggedInUserQuery);
    const deleteTweetQuery = `DELETE FROM tweet
                                WHERE tweet_id=${tweetId} and tweet.user_id=${logged_in_user.user_id};`;
    const deleteTweet = await db.run(deleteTweetQuery);

    if (deleteTweet !== undefined) {
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
