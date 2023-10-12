import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import AddTaskForm from './components/AddTaskForm';
import TaskList from './components/TaskList';
import { MdDarkMode, MdSunny } from 'react-icons/md';
import { get, set } from 'idb-keyval';
import * as duckdb from '@duckdb/duckdb-wasm';
import * as shell from '@duckdb/duckdb-wasm-shell';
import shellModule from '@duckdb/duckdb-wasm-shell/dist/shell_bg.wasm?url';
import './index.css';
import 'xterm/css/xterm.css';

/**
 *  @type {duckdb.AsyncDuckDBConnection} conn
 * */
let conn;
const shellEl = document.querySelector('#shell');
(async () => {
  // Select a bundle based on browser checks
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const worker_url = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));

  // Instantiate the asynchronus version of DuckDB-Wasm
  const worker = new Worker(worker_url);
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(worker_url);

  shell.embed({
    shellModule,
    container: shellEl,
    resolveDatabase: () => {
      return db;
    }
  });

  conn = await db.connect(); // Connect to db

  // Import Parquet
  const buf = await get('todos');
  if (buf) {
    await db.registerFileBuffer('todos.parquet', buf);
    conn.send(`create table todos as select * from 'todos.parquet'`);
  } else {
    conn.send(`create table todos(id bigint primary key, title varchar, completed bool)`);
  }

  // done import
  shellEl.dispatchEvent(new Event('duckdb.initialized'));
})();

const saveDuckdb = async () => {
  // Export Parquet
  await conn.send(`copy (select * from todos) to 'todos.parquet'`);
  await set('todos', await conn.bindings.copyFileToBuffer('todos.parquet'));
};

const App = () => {
  const [tasks, setTasks] = useState([]);
  const [darkTheme, setDarkTheme] = useState(false);

  useEffect(() => {
    shellEl.addEventListener('duckdb.initialized', async () => {
      const tasks = await conn.query('select * from todos');
      setTasks(tasks.toArray());
    });
  }, []);

  const addTask = async (title) => {
    const newTask = { id: Date.now(), title, completed: false };
    await conn.send(`insert into todos(id,title,completed) values(${newTask.id},'${newTask.title}', ${newTask.completed})`);
    await saveDuckdb();
    setTasks([...tasks, newTask]);
  };

  const editTask = async (id, title) => {
    await conn.send(`update todos set title='${title}' where id = ${id}`);
    await saveDuckdb();
    setTasks(tasks.map((task) => (task.id === id ? { ...task, title } : task)));
  };

  const deleteTask = async (id) => {
    await conn.send(`delete from todos where id = ${id}`);
    await saveDuckdb();
    setTasks(tasks.filter((task) => task.id !== id));
  };

  const toggleCompleted = async (id) => {
    const completed = !tasks.find((task) => task.id === id).completed;
    await conn.send(`update todos set completed=${completed} where id = ${id}`);
    await saveDuckdb();
    setTasks(tasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task)));
  };

  const clearTasks = () => {
    setTasks([]);
  };

  const getCompletedTasks = () => tasks.filter((task) => task.completed);
  const getRemainingTasks = () => tasks.filter((task) => !task.completed);

  const toggleTheme = () => {
    setDarkTheme((prevTheme) => !prevTheme);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <div className={`hero ${darkTheme ? 'bg-gray-900' : 'bg-gray-100'} h-screen md:min-h-[700px]  w-full m-auto flex flex-col items-center mt-14 transition-all duration-500`}>
        <div className={`flex flex-col space-y-6 w-[600px] md:w-[100%] z-10 p-4 ${darkTheme ? 'text-white' : 'text-black'}`}>
          <div className=" w-full flex items-center justify-between">
            <h1 className=" uppercase text-4xl font-bold text-white tracking-widest mb-4 md:text-3xl">
              {/* Task Manager */}
              My Tasks
            </h1>

            {darkTheme ? (
              <MdSunny onClick={toggleTheme} className={`bg-gray-300 cursor-pointer dark:bg-gray-700 p-2 rounded-lg  bottom-5 right-5 ${darkTheme ? 'text-white' : 'text-black'}`} size={32} />
            ) : (
              <MdDarkMode onClick={toggleTheme} className={`bg-gray-300 cursor-pointer dark:bg-gray-700 p-2 rounded-lg  bottom-5 right-5 ${darkTheme ? 'text-white' : 'text-black'}`} size={32} />
            )}
          </div>
          <div className=" shadow-md">
            <AddTaskForm darkTheme={darkTheme} onAddTask={addTask} />
          </div>
          <div className={`scroll ${darkTheme ? 'bg-gray-800' : 'bg-white'} w-full h-[500px] md:h-[500px] px-2 overflow-y-scroll rounded-md shadow-lg relative transition-all duration-500`}>
            <div className={`w-full overflow-hidden mb- sticky top-0 ${darkTheme ? 'bg-gray-800' : 'bg-white'} flex items-center justify-between text-gray-500 border-b`}>
              <p className=" text-gray-500 px-2 py-3">{getRemainingTasks().length} tasks left </p>
              <button onClick={clearTasks}>Clear all tasks</button>
            </div>

            {tasks.length ? (
              <TaskList tasks={tasks} onEditTask={editTask} onDeleteTask={deleteTask} onToggleCompleted={toggleCompleted} />
            ) : (
              <div className="w-full h-[80%] flex items-center justify-center overflow-hidden">
                <p className="text-gray-500 text-center z-10">Empty task</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
