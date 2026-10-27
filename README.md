# Calculations × 20

A small brain-training style game: solve 20 quick addition, subtraction and multiplication problems as fast as you can. Plain HTML, CSS and JavaScript — no build step.

## Play locally
Open `index.html` in a browser.

## Publish with GitHub Pages
1. Create a new repository and upload `index.html`, `style.css` and `script.js` to the root.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then **Save**.
4. After a minute your game is live at `https://<your-username>.github.io/<repo-name>/`.

## Supabase leaderboard
1. Create a Supabase project and open its SQL Editor.
2. Run the contents of `supabase.sql` to create the leaderboard table and score-submission function.
3. In `script.js`, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the project URL and public anon key from **Project Settings → API**. These browser-side settings work with GitHub Pages; never put a service-role key in the game.
4. Publish the updated files. The title screen shows the ten fastest scores. After a game, enter a name and save the score. Names are unique without regard to letter case; each name keeps only its fastest time.

## How it works
- The top screen shows the problems; they scroll up as each one is answered, right or wrong.
- The bottom screen has a number pad (a physical keyboard works too: digits, Backspace, Enter, Esc to quit).
- An answer is submitted automatically once you've typed as many digits as the answer has. Enter submits early.
- Final time = raw time + 2 seconds per mistake. Your best time is saved in the browser.
