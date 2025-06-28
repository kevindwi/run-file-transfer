export const Toast = () => {
  return (
    <div
      id="toast-interactive"
      className="w-full text-gray-500 bg-white"
      role="alert"
    >
      <div className="flex">
        <div className="inline-flex items-center justify-center shrink-0 w-8 h-8 text-blue-500 bg-blue-100 rounded-lg ">
          <svg
            className="w-4 h-4"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 18 20"
          >
            <path
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M16 1v5h-5M2 19v-5h5m10-4a8 8 0 0 1-14.947 3.97M1 10a8 8 0 0 1 14.947-3.97"
            />
          </svg>
          <span className="sr-only">Refresh icon</span>
        </div>
        <div className="ms-3 text-sm font-normal">
          <span className="mb-1 text-sm font-semibold text-gray-900">
            Update available
          </span>
          <div className="mb-2 text-sm font-normal">
            A new software version is available for download.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <a
                href="#"
                className="inline-flex justify-center w-full px-2 py-1.5 text-xs font-medium text-center text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300"
              >
                Update
              </a>
            </div>
            <div>
              <a
                href="#"
                className="inline-flex justify-center w-full px-2 py-1.5 text-xs font-medium text-center text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-gray-200"
              >
                Not now
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
